import { useToastStore } from "@/hooks/use-toast";
import type { SyncResult } from "@/lib/sync/sync-engine";
import {
  refreshPendingDirtyCount,
  runManualFullSync
} from "@/lib/sync/sync-engine";

let lastSyncFailureToastAt = 0;

/**
 * Throttled destructive toast with Retry (avoids spam during debounced sync loops).
 */
export function maybeToastSyncFailure(result: SyncResult): void {
  if (result.skipped || result.ok) return;
  const now = Date.now();
  if (now - lastSyncFailureToastAt < 55_000) return;
  lastSyncFailureToastAt = now;

  const description =
    result.errors[0] ??
    result.reason ??
    "Check your connection and try again.";

  useToastStore.getState().push({
    title: "Could not finish sync",
    description,
    variant: "destructive",
    action: {
      label: "Retry",
      onClick: () => {
        void runManualFullSync().then(() => refreshPendingDirtyCount());
      }
    }
  });
}
