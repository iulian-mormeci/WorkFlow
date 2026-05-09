import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** True if request carries any Supabase browser session cookie (names vary by SDK/version). */
function hasSupabaseSessionCookie(req: NextRequest) {
  return req.cookies.getAll().some((c) => {
    const n = c.name;
    if (!n.startsWith("sb-")) return false;
    // Common patterns: sb-<ref>-auth-token, sb-<ref>-auth-token.0 (chunked), etc.
    return (
      n.includes("auth-token") ||
      n.endsWith("-auth-token") ||
      (n.includes("supabase") && n.includes("auth"))
    );
  });
}

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
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico" ||
    pathname === "/icon" ||
    pathname === "/apple-icon"
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

  const pathname = req.nextUrl.pathname;
  // Do not cache authenticated HTML (browser / reverse proxy). DNS-only Cloudflare still OK.
  res.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Vary", "Cookie");

  if (isPublicPath(pathname)) return res;

  // Official pattern: getUser() refreshes JWT and writes cookies via setAll on this response.
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) return res;

  // Cookie present but getUser failed (e.g. offline): allow app shell (offline-first).
  if (hasSupabaseSessionCookie(req)) return res;

  const redirectUrl = req.nextUrl.clone();
  redirectUrl.pathname = "/login";
  redirectUrl.searchParams.set("next", pathname);
  const redirectRes = NextResponse.redirect(redirectUrl);
  redirectRes.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  redirectRes.headers.set("Pragma", "no-cache");
  redirectRes.headers.set("Vary", "Cookie");
  return redirectRes;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"]
};

