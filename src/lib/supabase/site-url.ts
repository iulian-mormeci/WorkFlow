export function getSiteUrl(): string {
  const v = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (v) return v.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  // Safe fallback for builds; MUST be set in production env.
  return "http://localhost:3000";
}

export function getAuthCallbackUrl(): string {
  return `${getSiteUrl()}/auth/callback`;
}

