import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthRedirectOrigin, resolveAuthNextPath } from "@/lib/supabase/site-url";

/** OAuth / magic-link return handler: exchanges `code` for a session and sets cookies. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const publicOrigin = getAuthRedirectOrigin(req);
  const nextPath = resolveAuthNextPath(url.searchParams.get("next"));

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const res = NextResponse.redirect(new URL(nextPath, publicOrigin));
  if (!code || !supaUrl || !anonKey) return res;

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

  await supabase.auth.exchangeCodeForSession(code);

  return res;
}

