/**
 * Central limits for Edge middleware (per IP, per isolate — see `rate-limit.ts`).
 * Tune for your traffic; for multi-node production consider Redis / a gateway limiter.
 */
export const RATE_LIMITS = {
  authPassword: { limit: 12, windowMs: 15 * 60 * 1000 },
  supportEmail: { limit: 24, windowMs: 60 * 60 * 1000 },
  reminderEmail: { limit: 36, windowMs: 60 * 60 * 1000 },
  geocode: { limit: 90, windowMs: 60 * 1000 },
  mapStatic: { limit: 120, windowMs: 60 * 60 * 1000 },
  routeGeometry: { limit: 120, windowMs: 60 * 60 * 1000 },
  routeDistance: { limit: 120, windowMs: 60 * 60 * 1000 },
  menuToCsv: { limit: 10, windowMs: 15 * 60 * 1000 }
} as const;
