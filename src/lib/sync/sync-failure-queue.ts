import { create } from "zustand";

export type SyncFailureKind = "sync" | "upload" | "delete";

export type SyncFailureItem = {
  id: string;
  kind: SyncFailureKind;
  title: string;
  detail: string;
  at: number;
};

const STORAGE_KEY = "workflow:syncFailureQueue:v1";
const MAX = 40;

function load(): SyncFailureItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is SyncFailureItem =>
        typeof x === "object" &&
        x != null &&
        typeof (x as SyncFailureItem).id === "string" &&
        typeof (x as SyncFailureItem).kind === "string"
    );
  } catch {
    return [];
  }
}

function save(items: SyncFailureItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    // ignore quota
  }
}

type QueueState = {
  items: SyncFailureItem[];
  hydrated: boolean;
  hydrate: () => void;
  push: (p: Omit<SyncFailureItem, "id" | "at"> & { id?: string }) => string;
  dismiss: (id: string) => void;
  clearAll: () => void;
  clearKind: (kind: SyncFailureKind) => void;
};

export const useSyncFailureQueue = create<QueueState>((set, get) => ({
  items: [],
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ items: load(), hydrated: true });
  },
  push: (p) => {
    const id = p.id ?? crypto.randomUUID();
    const now = Date.now();
    const item: SyncFailureItem = {
      id,
      kind: p.kind,
      title: p.title,
      detail: p.detail,
      at: now
    };
    const prev = get().items.filter(
      (x) => !(x.kind === item.kind && x.title === item.title && now - x.at < 4000)
    );
    const items = [item, ...prev].slice(0, MAX);
    save(items);
    set({ items });
    return id;
  },
  dismiss: (id) => {
    const items = get().items.filter((x) => x.id !== id);
    save(items);
    set({ items });
  },
  clearAll: () => {
    save([]);
    set({ items: [] });
  },
  clearKind: (kind) => {
    const items = get().items.filter((x) => x.kind !== kind);
    save(items);
    set({ items });
  }
}));

export function pushSyncFailure(
  p: Omit<SyncFailureItem, "id" | "at"> & { id?: string }
): string {
  return useSyncFailureQueue.getState().push(p);
}
