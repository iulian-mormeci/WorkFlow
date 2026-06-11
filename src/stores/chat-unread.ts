import { create } from "zustand";

type ChatUnreadState = {
  count: number;
  increment: () => void;
  reset: () => void;
};

export const useChatUnreadStore = create<ChatUnreadState>((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
  reset: () => set({ count: 0 })
}));
