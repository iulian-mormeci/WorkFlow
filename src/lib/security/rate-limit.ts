type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();
const MAX_KEYS = 4096;

function prune(now: number) {
  for (const [k, v] of store) {
    if (v.resetAt < now) store.delete(k);
  }
  if (store.size <= MAX_KEYS) return;
  const keys = [...store.keys()];
  keys.slice(0, Math.floor(keys.length / 2)).forEach((k) => store.delete(k));
}

/**
 * Fixed-window counter (Edge-safe, in-memory per isolate).
 * For distributed production traffic, prefer Redis / Upstash in front of the app.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const now = Date.now();
  prune(now);

  let b = store.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    store.set(key, b);
  }

  if (b.count >= limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count += 1;
  return { allowed: true };
}

export function getClientIp(req: { headers: Headers }): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
