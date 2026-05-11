import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function isHttpsRequest(req: NextRequest): boolean {
  const xf = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (xf === "https") return true;
  if (xf === "http") return false;
  return req.nextUrl.protocol === "https:";
}

/**
 * Applies defense-in-depth headers to any `NextResponse` (including redirects and 429s).
 * CSP is defined in `next.config.mjs` so `_next/static` assets receive the same policy.
 */
export function applySecurityHeaders(req: NextRequest, res: NextResponse): void {
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "accelerometer=(), autoplay=(), camera=(), encrypted-media=(), fullscreen=(self), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()"
  );

  if (isHttpsRequest(req)) {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
}
