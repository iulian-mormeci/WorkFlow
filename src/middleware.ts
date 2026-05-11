/**
 * Next.js edge middleware: Supabase session refresh + route protection.
 *
 * Public routes skip auth. Elsewhere we call `getUser()` so JWT refresh runs on every
 * navigation. If the user is missing but a session cookie exists (e.g. flaky network),
 * we still allow the shell—WorkFlow is offline-first and the client can retry auth.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Whether the request carries a Supabase auth cookie (chunked names included). */
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

type Locale = "it" | "en";

/** next-intl reads this header in RSC (`getTranslations`, `getLocale`, etc.). Must be on the *request* passed through rewrites. */
const NEXT_INTL_LOCALE_HEADER = "X-NEXT-INTL-LOCALE";

function isLocalizablePath(pathname: string) {
  return !(
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/favicon.ico" ||
    pathname === "/site.webmanifest" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/robots.txt" ||
    pathname === "/icon" ||
    pathname === "/apple-icon"
  );
}

function getLocaleFromRequest(req: NextRequest): { locale: Locale; pathnameNoLocale: string } {
  const p = req.nextUrl.pathname;
  if (p === "/en" || p.startsWith("/en/"))
    return { locale: "en", pathnameNoLocale: p === "/en" ? "/" : p.slice(3) };
  if (p === "/it" || p.startsWith("/it/"))
    return { locale: "it", pathnameNoLocale: p === "/it" ? "/" : p.slice(3) };
  const cookie = req.cookies.get("NEXT_LOCALE")?.value;
  const locale: Locale = cookie === "en" ? "en" : "it";
  return { locale, pathnameNoLocale: p };
}

function isPublicPath(pathnameNoLocale: string) {
  return (
    pathnameNoLocale === "/" ||
    pathnameNoLocale.startsWith("/login") ||
    pathnameNoLocale.startsWith("/register") ||
    pathnameNoLocale.startsWith("/privacy") ||
    pathnameNoLocale.startsWith("/terms") ||
    pathnameNoLocale.startsWith("/accessibility") ||
    pathnameNoLocale.startsWith("/logout") ||
    pathnameNoLocale.startsWith("/auth/callback") ||
    pathnameNoLocale.startsWith("/auth/password") ||
    pathnameNoLocale.startsWith("/auth/session") ||
    pathnameNoLocale.startsWith("/auth/logout") ||
    pathnameNoLocale.startsWith("/_next/") ||
    pathnameNoLocale.startsWith("/icons/") ||
    pathnameNoLocale === "/site.webmanifest" ||
    pathnameNoLocale === "/manifest.webmanifest" ||
    pathnameNoLocale === "/robots.txt" ||
    pathnameNoLocale === "/favicon.ico" ||
    pathnameNoLocale === "/icon" ||
    pathnameNoLocale === "/apple-icon"
  );
}

/** Runs on matched routes: refreshes auth cookies, redirects anonymous users to `/login`. */
export async function middleware(req: NextRequest) {
  const { locale, pathnameNoLocale } = getLocaleFromRequest(req);

  const pathnameWithLocale = req.nextUrl.pathname;
  const hasEnPrefix = pathnameWithLocale === "/en" || pathnameWithLocale.startsWith("/en/");
  const hasItPrefix = pathnameWithLocale === "/it" || pathnameWithLocale.startsWith("/it/");

  // Enforce SEO-friendly prefixes: Italian is default (no /it), English always uses /en.
  if (isLocalizablePath(pathnameWithLocale)) {
    if (hasItPrefix) {
      // Never expose /it — keep default locale clean.
      const target = req.nextUrl.clone();
      target.pathname = pathnameWithLocale === "/it" ? "/" : pathnameWithLocale.slice(3);
      return NextResponse.redirect(target, 308);
    }
    if (locale === "en" && !hasEnPrefix) {
      const target = req.nextUrl.clone();
      target.pathname = pathnameWithLocale === "/" ? "/en" : `/en${pathnameWithLocale}`;
      return NextResponse.redirect(target, 307);
    }
    if (locale === "it" && hasEnPrefix) {
      // User explicitly selected Italian (cookie) while on an English URL.
      // Drop the /en prefix to keep default locale clean.
      const target = req.nextUrl.clone();
      target.pathname = pathnameNoLocale;
      return NextResponse.redirect(target, 307);
    }
  }

  // Forward resolved locale on the *incoming* request so App Router RSC + next-intl see the same
  // locale as the browser URL (`/en/...` rewrites internally to `/...` but must stay "en").
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(NEXT_INTL_LOCALE_HEADER, locale);
  requestHeaders.set("x-workflow-locale", locale);

  // Critical for App Router without an explicit `[locale]` segment:
  // we keep `/en/...` in the browser URL but internally serve the same route tree by rewriting
  // `/en/...` → `/...`. Without this, Next would try to match `/en/*` as real routes and 404.
  const res = isLocalizablePath(pathnameWithLocale) && hasEnPrefix
    ? NextResponse.rewrite(new URL(pathnameNoLocale, req.url), {
        request: { headers: requestHeaders }
      })
    : NextResponse.next({
        request: { headers: requestHeaders }
      });

  // IMPORTANT (Supabase SSR): when refreshing cookies in middleware, we must
  // update BOTH the response cookies and the in-memory request cookies,
  // otherwise downstream auth checks in the same request can see stale cookies.
  // This follows Supabase's recommended Next.js middleware pattern.
  // Response headers (optional): helps proxies / debugging; RSC reads request headers above.
  res.headers.set(NEXT_INTL_LOCALE_HEADER, locale);
  res.headers.set("x-workflow-locale", locale);
  // Keep next-intl's server-side locale (`requestLocale`) and our middleware in sync,
  // otherwise Server Components can render with a different locale and you get mixed strings.
  if (isLocalizablePath(pathnameWithLocale)) {
    res.cookies.set("NEXT_LOCALE", locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax"
    });
  }

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

  const pathname = pathnameNoLocale;
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
  redirectUrl.pathname = locale === "en" ? "/en/login" : "/login";
  redirectUrl.searchParams.set("next", locale === "en" ? (hasEnPrefix ? pathnameWithLocale : (pathname === "/" ? "/en" : `/en${pathname}`)) : pathname);
  const redirectRes = NextResponse.redirect(redirectUrl);
  redirectRes.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  redirectRes.headers.set("Pragma", "no-cache");
  redirectRes.headers.set("Vary", "Cookie");
  return redirectRes;
}

/** Exclude Next image/static from the edge bundle; everything else gets auth headers. */
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"]
};

