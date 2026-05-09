import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/auth/password") ||
    pathname.startsWith("/auth/session") ||
    pathname.startsWith("/auth/logout") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/site.webmanifest" ||
    pathname === "/favicon.ico"
  );
}

export async function middleware(req: NextRequest) {
  // IMPORTANT (Supabase SSR): when refreshing cookies in middleware, we must
  // update BOTH the response cookies and the in-memory request cookies,
  // otherwise downstream auth checks in the same request can see stale cookies.
  // This follows Supabase's recommended Next.js middleware pattern.
  const res = NextResponse.next({
    request: {
      headers: req.headers
    }
  });

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
          // Keep request cookies in sync for this middleware invocation.
          try {
            req.cookies.set(name, value);
          } catch {
            // ignore (some runtimes may not allow mutating request cookies)
          }
          res.cookies.set(name, value, options);
        });
      }
    }
  });

  // Refresh session if needed (best practice). This will also update cookies.
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user || isPublicPath(req.nextUrl.pathname)) return res;

  const redirectUrl = req.nextUrl.clone();
  redirectUrl.pathname = "/login";
  redirectUrl.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"]
};

