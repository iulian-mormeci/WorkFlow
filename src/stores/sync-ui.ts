/**
 * Lightweight UI + cache-bust state for sync and realtime.
 *
 * Dexie’s `useLiveQuery` won’t see remote writes unless something in React deps changes;
 * `liveQueryEpoch` is the blunt instrument we bump after successful sync or debounced
 * realtime traffic so list screens stay honest without subscribing every row.
 */
import { create } from "zustand";

export type SyncPhase = "idle" | "syncing" | "offline_pending";

type SyncUiState = {
  phase: SyncPhase;
  lastRealtimeAt: number | null;
  /** Last completed sync attempt (success or failure). */
  lastFullSyncAt: number | null;
  /** Last time a full sync finished without errors (for “Synced Xm ago”). */
  lastSuccessfulSyncAt: number | null;
  lastSyncError: string | null;
  /** Bumps when cloud data changes so `useLiveQuery` deps can re-run queries. */
  liveQueryEpoch: number;
  /** Rows with local changes not yet confirmed synced (approximate). */
  dirtyCount: number;
  setPhase: (p: SyncPhase) => void;
  touchRealtime: () => void;
  /** Debounced coalesced bump after realtime writes (performance-friendly). */
  scheduleRealtimeEpochBump: () => void;
  setFullSyncDone: (ok: boolean, err?: string | null) => void;
  setDirtyCount: (n: number) => void;
  bumpLiveQueryEpoch: () => void;
};

let realtimeEpochTimer: number | null = null;

/** Global store; safe to import from client components and sync helpers. */
export const useSyncUiStore = create<SyncUiState>((set, get) => ({
  phase: "idle",
  lastRealtimeAt: null,
  lastFullSyncAt: null,
  lastSuccessfulSyncAt: null,
  lastSyncError: null,
  liveQueryEpoch: 0,
  dirtyCount: 0,
  setPhase: (phase) => set({ phase }),
  touchRealtime: () => {
    set({ lastRealtimeAt: Date.now() });
    get().scheduleRealtimeEpochBump();
  },
  scheduleRealtimeEpochBump: () => {
    if (typeof window === "undefined") return;
    if (realtimeEpochTimer) return;
    realtimeEpochTimer = window.setTimeout(() => {
      realtimeEpochTimer = null;
      set((s) => ({ liveQueryEpoch: s.liveQueryEpoch + 1 }));
    }, 400);
  },
  bumpLiveQueryEpoch: () => set((s) => ({ liveQueryEpoch: s.liveQueryEpoch + 1 })),
  setFullSyncDone: (ok, err = null) =>
    set((s) => ({
      phase: "idle",
      lastFullSyncAt: Date.now(),
      lastSyncError: ok ? null : err ?? "Sync failed",
      ...(ok
        ? {
            lastSuccessfulSyncAt: Date.now(),
            liveQueryEpoch: s.liveQueryEpoch + 1
          }
        : {})
    })),
  setDirtyCount: (dirtyCount) => set({ dirtyCount })
}));
