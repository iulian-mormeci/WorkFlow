import { create } from "zustand";

type UserServicesState = {
  activatedIds: ReadonlySet<string>;
  hydrated: boolean;
  setActivatedIds: (ids: readonly string[]) => void;
  activate: (id: string) => void;
  deactivate: (id: string) => void;
};

/**
 * Which optional services the signed-in user switched on (mirrors
 * wf_user_services). Core services are always visible and never touch this
 * store — see `isServiceNavItemVisible` in sidebar-nav.tsx.
 */
export const useUserServicesStore = create<UserServicesState>((set) => ({
  activatedIds: new Set(),
  hydrated: false,
  setActivatedIds: (ids) => set({ activatedIds: new Set(ids), hydrated: true }),
  activate: (id) =>
    set((s) => ({ activatedIds: new Set(s.activatedIds).add(id) })),
  deactivate: (id) =>
    set((s) => {
      const next = new Set(s.activatedIds);
      next.delete(id);
      return { activatedIds: next };
    })
}));
