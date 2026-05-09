import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/auth/session") ||
    pathname.startsWith("/auth/logout") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/site.webmanifest" ||
    pathname === "/favicon.ico"
  );
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // If env isn't configured yet, don't hard-fail middleware in dev.
  if (!url || !anonKey) return res;

  const supabase = createServerClient(url, anonKey, {
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

  // Refresh session if needed (best practice).
  // Use getUser() to trigger refresh logic. Then use getSession() as the auth gate.
  await supabase.auth.getUser();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (session || isPublicPath(req.nextUrl.pathname)) return res;

  const redirectUrl = req.nextUrl.clone();
  redirectUrl.pathname = "/login";
  redirectUrl.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"]
};

