/**
 * Next.js server-startup hook (runs once when the Node process boots, not
 * during `next build`). Schedules the hourly UnoERP sync by hitting a local
 * API route rather than importing `@/lib/unoerp/cron` directly: this project
 * also has middleware.ts, which makes Next.js additionally compile
 * instrumentation.ts for the Edge pass, and anything reachable from that
 * import chain (down to `node:crypto` in the token encryption helper) fails
 * there — the Edge Runtime forbids `node:` built-ins outright. Routing
 * through `/api/unoerp/cron` keeps the real sync logic inside a normal
 * Node.js-only route handler (already proven to bundle fine, same as
 * `/api/unoerp/sync`), so this file's own import graph stays trivial.
 *
 * Caveat: if this app is ever run under PM2 in cluster mode (multiple Node
 * instances), each instance registers its own cron and the hourly sync would
 * fire once per instance. Fine for a single-instance PM2 process (the
 * documented deployment for this app); revisit with a distributed lock
 * before scaling out.
 */
export const runtime = "nodejs";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  // `eval("require")` hides this from webpack's static import graph so the
  // Edge compiler pass never tries to resolve node-cron's Node builtins
  // (child_process, path). A real `require("node-cron")` still runs fine at
  // actual startup, in the real Node.js process.
  const nodeRequire: NodeRequire = eval("require");
  const cron = nodeRequire("node-cron") as typeof import("node-cron");

  cron.schedule("0 * * * *", () => {
    void triggerUnoErpCron();
  });

  console.log("[unoerp-cron] scheduled hourly sync");
}

async function triggerUnoErpCron() {
  const secret = process.env.UNOERP_CRON_SECRET;
  if (!secret) {
    console.error("[unoerp-cron] UNOERP_CRON_SECRET not set, skipping run");
    return;
  }
  const port = process.env.PORT ?? "3000";
  try {
    await fetch(`http://127.0.0.1:${port}/api/unoerp/cron`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` }
    });
  } catch (e) {
    console.error("[unoerp-cron] trigger failed:", e instanceof Error ? e.message : String(e));
  }
}
