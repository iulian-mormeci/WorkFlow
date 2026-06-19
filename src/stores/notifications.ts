import { create } from "zustand";

export type AppNotification = {
  id: string;
  type: "global_procedure_approved";
  title: string;
  body: string | null;
  actorId: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationsState = {
  unread: number;
  notifications: AppNotification[];
  setUnread: (n: number) => void;
  increment: () => void;
  markAllRead: () => void;
  setNotifications: (list: AppNotification[]) => void;
  prependNotification: (n: AppNotification) => void;
};

export const useNotificationsStore = create<NotificationsState>((set) => ({
  unread: 0,
  notifications: [],
  setUnread: (n) => set({ unread: n }),
  increment: () => set((s) => ({ unread: s.unread + 1 })),
  markAllRead: () =>
    set((s) => ({
      unread: 0,
      notifications: s.notifications.map((n) =>
        n.readAt ? n : { ...n, readAt: new Date().toISOString() }
      )
    })),
  setNotifications: (list) => set({ notifications: list }),
  prependNotification: (n) =>
    set((s) => ({ notifications: [n, ...s.notifications] }))
}));
