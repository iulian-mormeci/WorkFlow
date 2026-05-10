import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthRedirectOrigin } from "@/lib/supabase/site-url";

/** Clears Supabase cookies then redirects to `/login` on the canonical public origin. */
export async function GET(req: NextRequest) {
  const publicOrigin = getAuthRedirectOrigin(req);
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const res = NextResponse.redirect(new URL("/login", publicOrigin));
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

