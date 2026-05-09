"use client";

import { create } from "zustand";
import { useMemo } from "react";
import type { Toast } from "@/components/ui/toast";

type ToastState = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
};

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        {
          id: crypto.randomUUID(),
          ...t
        }
      ]
    })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
}));

export function useToast() {
  // IMPORTANT (Next.js App Router + useSyncExternalStore):
  // avoid returning a new object from the zustand selector (can cause snapshot warnings).
  const toast = useToastStore((s) => s.push);
  const dismiss = useToastStore((s) => s.dismiss);
  return useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
}

