import { useSyncUiStore } from "@/stores/sync-ui";

/** Add to `useLiveQuery` dependency arrays so lists refresh after a successful sync. */
export function useWorkflowLiveEpoch(): number {
  return useSyncUiStore((s) => s.liveQueryEpoch);
}
