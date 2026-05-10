import type { NextRequest } from "next/server";

/**
 * Public site base URL (no trailing slash). Used in the browser and anywhere env is enough.
 * In production, set `NEXT_PUBLIC_SITE_URL` to your canonical origin (e.g. https://workflow.mormeci.it).
 */
export function getSiteUrl(): string {
  const v = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (v) return v.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  // Dev / prerender only — production should always set NEXT_PUBLIC_SITE_URL for stable auth redirects.
  return "http://localhost:3000";
}

/**
 * Origin for **server** auth redirects (logout, OAuth callback). Never trust `req.url` alone:
 * behind reverse proxies it can disagree with the browser-visible host, which sends people
 * to localhost or the wrong deployment. Order: configured URL → forwarded headers → request URL.
 */
export function getAuthRedirectOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ?? "";
  if (configured) return configured;

  const xfHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = xfHost || req.headers.get("host")?.split(",")[0]?.trim();
  const xfProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const proto =
    xfProto === "https" || xfProto === "http"
      ? xfProto
      : req.nextUrl.protocol === "https:"
        ? "https"
        : "http";

  if (host) {
    try {
      return new URL(`${proto}://${host}`).origin.replace(/\/+$/, "");
    } catch {
      /* fall through */
    }
  }

  return new URL(req.url).origin.replace(/\/+$/, "");
}

/**
 * `next` query from `/auth/callback` — must stay a same-site path (open-redirect hardening).
 */
export function resolveAuthNextPath(nextParam: string | null): string {
  const fallback = "/dashboard";
  if (nextParam == null) return fallback;
  const next = nextParam.trim();
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\") || next.includes("\0")) return fallback;
  return next;
}

export function getAuthCallbackUrl(): string {
  return `${getSiteUrl()}/auth/callback`;
}

