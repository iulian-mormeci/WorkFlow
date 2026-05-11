import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthRedirectOrigin } from "@/lib/supabase/site-url";

/** Clears Supabase cookies then redirects to `/` on the canonical public origin. */
export async function GET(req: NextRequest) {
  const publicOrigin = getAuthRedirectOrigin(req);
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 303 is the safest redirect after a state-changing request (even though this is GET),
  // and avoids edge cases where caches or clients re-play with the wrong method.
  const res = NextResponse.redirect(new URL("/", publicOrigin), { status: 303 });
  if (!supaUrl || !anonKey) return res;

  const supabase = createServerClient(supaUrl, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      }
    }
  });

  await supabase.auth.signOut();
  return res;
}

