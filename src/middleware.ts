/**
 * Next.js edge middleware: Supabase session refresh + route protection.
 *
 * Public routes skip auth. Elsewhere we call `getUser()` so JWT refresh runs on every
 * navigation. If the user is missing but a session cookie exists (e.g. flaky network),
 * we still allow the shell—WorkFlow is offline-first and the client can retry auth.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { applySecurityHeaders } from "@/lib/security/http-security";
import { RATE_LIMITS } from "@/lib/security/rate-limit-config";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { logSecurityEvent } from "@/lib/security/security-log";

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
  const cookieRaw = req.cookies.get("NEXT_LOCALE")?.value;

  if (p === "/en" || p.startsWith("/en/")) {
    const pathnameNoLocale = p === "/en" ? "/" : p.slice(3);
    // URL says English, but the switcher sets NEXT_LOCALE=it before navigation finishes.
    // If we always trusted /en/*, Italian could never "win" and the UI stayed English.
    if (cookieRaw === "it") {
      return { locale: "it", pathnameNoLocale };
    }
    return { locale: "en", pathnameNoLocale };
  }
  if (p === "/it" || p.startsWith("/it/"))
    return { locale: "it", pathnameNoLocale: p === "/it" ? "/" : p.slice(3) };
  const locale: Locale = cookieRaw === "en" ? "en" : "it";
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

function finish(req: NextRequest, res: NextResponse): NextResponse {
  applySecurityHeaders(req, res);
  return res;
}

/** Runs on matched routes: refreshes auth cookies, redirects anonymous users to `/login`. */
export async function middleware(req: NextRequest) {
  const { locale, pathnameNoLocale } = getLocaleFromRequest(req);
  const ip = getClientIp(req);

  if (req.method === "POST" && pathnameNoLocale === "/auth/password") {
    const c = RATE_LIMITS.authPassword;
    const rl = checkRateLimit(`auth:pw:${ip}`, c.limit, c.windowMs);
    if (!rl.allowed) {
      logSecurityEvent({
        event: "rate_limited",
        route: "/auth/password",
        ip,
        retryAfterSec: rl.retryAfterSec
      });
      return finish(
        req,
        NextResponse.json(
          { ok: false, error: "Too many sign-in attempts. Try again later." },
          { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
        )
      );
    }
  }

  if (req.method === "POST" && pathnameNoLocale.startsWith("/api/support-email")) {
    const c = RATE_LIMITS.supportEmail;
    const rl = checkRateLimit(`api:support-email:${ip}`, c.limit, c.windowMs);
    if (!rl.allowed) {
      logSecurityEvent({
        event: "rate_limited",
        route: "/api/support-email",
        ip,
        retryAfterSec: rl.retryAfterSec
      });
      return finish(
        req,
        new NextResponse("Too many requests", {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec) }
        })
      );
    }
  }

  if (req.method === "POST" && pathnameNoLocale.startsWith("/api/reminder-email")) {
    const c = RATE_LIMITS.reminderEmail;
    const rl = checkRateLimit(`api:reminder-email:${ip}`, c.limit, c.windowMs);
    if (!rl.allowed) {
      logSecurityEvent({
        event: "rate_limited",
        route: "/api/reminder-email",
        ip,
        retryAfterSec: rl.retryAfterSec
      });
      return finish(
        req,
        NextResponse.json(
          { ok: false, error: "Too many requests" },
          { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
        )
      );
    }
  }

  if (req.method === "GET" && pathnameNoLocale.startsWith("/api/geocode")) {
    const c = RATE_LIMITS.geocode;
    const rl = checkRateLimit(`api:geocode:${ip}`, c.limit, c.windowMs);
    if (!rl.allowed) {
      logSecurityEvent({
        event: "rate_limited",
        route: "/api/geocode",
        ip,
        retryAfterSec: rl.retryAfterSec
      });
      return finish(
        req,
        NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } })
      );
    }
  }

  if (req.method === "GET" && pathnameNoLocale.startsWith("/api/map-static")) {
    const c = RATE_LIMITS.mapStatic;
    const rl = checkRateLimit(`api:map-static:${ip}`, c.limit, c.windowMs);
    if (!rl.allowed) {
      logSecurityEvent({
        event: "rate_limited",
        route: "/api/map-static",
        ip,
        retryAfterSec: rl.retryAfterSec
      });
      return finish(
        req,
        NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } })
      );
    }
  }

  if (req.method === "POST" && pathnameNoLocale.startsWith("/api/route-geometry")) {
    const c = RATE_LIMITS.routeGeometry;
    const rl = checkRateLimit(`api:route-geometry:${ip}`, c.limit, c.windowMs);
    if (!rl.allowed) {
      logSecurityEvent({
        event: "rate_limited",
        route: "/api/route-geometry",
        ip,
        retryAfterSec: rl.retryAfterSec
      });
      return finish(
        req,
        NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } })
      );
    }
  }

  if (req.method === "POST" && pathnameNoLocale.startsWith("/api/route-distance")) {
    const c = RATE_LIMITS.routeDistance;
    const rl = checkRateLimit(`api:route-distance:${ip}`, c.limit, c.windowMs);
    if (!rl.allowed) {
      logSecurityEvent({
        event: "rate_limited",
        route: "/api/route-distance",
        ip,
        retryAfterSec: rl.retryAfterSec
      });
      return finish(
        req,
        NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } })
      );
    }
  }

  const pathnameWithLocale = req.nextUrl.pathname;
  const hasEnPrefix = pathnameWithLocale === "/en" || pathnameWithLocale.startsWith("/en/");
  const hasItPrefix = pathnameWithLocale === "/it" || pathnameWithLocale.startsWith("/it/");

  // Enforce SEO-friendly prefixes: Italian is default (no /it), English always uses /en.
  if (isLocalizablePath(pathnameWithLocale)) {
    if (hasItPrefix) {
      // Never expose /it — keep default locale clean.
      const target = req.nextUrl.clone();
      target.pathname = pathnameWithLocale === "/it" ? "/" : pathnameWithLocale.slice(3);
      return finish(req, NextResponse.redirect(target, 308));
    }
    if (locale === "en" && !hasEnPrefix) {
      const target = req.nextUrl.clone();
      target.pathname = pathnameWithLocale === "/" ? "/en" : `/en${pathnameWithLocale}`;
      return finish(req, NextResponse.redirect(target, 307));
    }
    if (locale === "it" && hasEnPrefix) {
      // User explicitly selected Italian (cookie) while on an English URL.
      // Drop the /en prefix to keep default locale clean.
      const target = req.nextUrl.clone();
      target.pathname = pathnameNoLocale;
      return finish(req, NextResponse.redirect(target, 307));
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
  if (!url || !anonKey) return finish(req, res);

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

  if (isPublicPath(pathname)) return finish(req, res);

  // Official pattern: getUser() refreshes JWT and writes cookies via setAll on this response.
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) return finish(req, res);

  // Cookie present but getUser failed (e.g. offline): allow app shell (offline-first).
  if (hasSupabaseSessionCookie(req)) return finish(req, res);

  const redirectUrl = req.nextUrl.clone();
  redirectUrl.pathname = locale === "en" ? "/en/login" : "/login";
  redirectUrl.searchParams.set("next", locale === "en" ? (hasEnPrefix ? pathnameWithLocale : (pathname === "/" ? "/en" : `/en${pathname}`)) : pathname);
  const redirectRes = NextResponse.redirect(redirectUrl);
  redirectRes.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  redirectRes.headers.set("Pragma", "no-cache");
  redirectRes.headers.set("Vary", "Cookie");
  return finish(req, redirectRes);
}

/** Exclude Next image/static from the edge bundle; everything else gets auth headers. */
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"]
};
