"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth";
import { useNotificationsStore, type AppNotification } from "@/stores/notifications";

function rowToNotification(r: Record<string, unknown>): AppNotification {
  return {
    id: String(r.id),
    type: r.type as AppNotification["type"],
    title: String(r.title),
    body: (r.body as string) ?? null,
    actorId: (r.actor_id as string) ?? null,
    entityId: (r.entity_id as string) ?? null,
    readAt: (r.read_at as string) ?? null,
    createdAt: String(r.created_at)
  };
}

/**
 * Mounts once in the protected layout.
 * - Fetches the 30 most recent notifications on mount and stores them.
 * - Subscribes to Realtime INSERT events to badge new arrivals.
 */
export function NotificationsProvider() {
  const user = useAuthStore((s) => s.user);
  const { setUnread, setNotifications, increment, prependNotification } =
    useNotificationsStore();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!user || !supabase) return;

    // Initial fetch of recent notifications.
    (async () => {
      const { data } = await supabase
        .from("wf_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);

      if (!data) return;
      const list = (data as Record<string, unknown>[]).map(rowToNotification);
      setNotifications(list);
      setUnread(list.filter((n) => !n.readAt).length);
    })();

    // Realtime subscription for new notifications.
    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wf_notifications",
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const n = rowToNotification(payload.new as Record<string, unknown>);
          prependNotification(n);
          increment();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, setUnread, setNotifications, increment, prependNotification]);

  return null;
}
