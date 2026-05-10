import { useSyncUiStore } from "@/stores/sync-ui";

/**
 * Subscribe to the sync store’s `liveQueryEpoch` counter.
 * @returns Monotonic-ish integer—include it in `useLiveQuery` deps whenever a list
 * should refetch after cloud reconciliation or debounced realtime bumps.
 */
export function useWorkflowLiveEpoch(): number {
  return useSyncUiStore((s) => s.liveQueryEpoch);
}
