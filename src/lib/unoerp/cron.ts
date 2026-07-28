import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runUnoErpSync } from "@/lib/unoerp/sync";

const MAX_CONCURRENT = 5;
/** Don't re-trigger a sync that's still marked "running" from the last ~10 minutes. */
const SKIP_IF_RUNNING_WITHIN_MS = 10 * 60 * 1000;

/**
 * Hourly sync across every user with UnoERP credentials — see instrumentation.ts.
 * Logs only start/end/errors, never row contents (per the integration's
 * security requirements).
 */
export async function runUnoErpCronSync(): Promise<void> {
  const service = createSupabaseServiceClient();
  if (!service) {
    console.error("[unoerp-cron] service client unavailable, skipping run");
    return;
  }

  const { data: rows, error } = await service
    .from("wf_unoerp_credentials")
    .select("user_id, last_sync_at, last_sync_status");

  if (error) {
    console.error("[unoerp-cron] failed to list credentials:", error.message);
    return;
  }

  const now = Date.now();
  const candidates = (rows ?? []).filter((r: { last_sync_status: string | null; last_sync_at: string | null }) => {
    if (r.last_sync_status === "running" && r.last_sync_at) {
      const elapsed = now - new Date(r.last_sync_at).getTime();
      if (elapsed < SKIP_IF_RUNNING_WITHIN_MS) return false;
    }
    return true;
  });

  console.log(`[unoerp-cron] starting: ${candidates.length} user(s)`);

  for (let i = 0; i < candidates.length; i += MAX_CONCURRENT) {
    const batch = candidates.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.allSettled(
      batch.map((r: { user_id: string }) => runUnoErpSync(service, r.user_id))
    );
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[unoerp-cron] sync threw:", result.reason);
      } else if (!result.value.ok) {
        console.error("[unoerp-cron] sync failed:", result.value.error);
      }
    }
  }

  console.log("[unoerp-cron] finished");
}
