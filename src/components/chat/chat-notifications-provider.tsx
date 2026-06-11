"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth";
import { isGlobalProcedureAdmin } from "@/lib/procedures/global-procedure-admin";
import { useChatUnreadStore } from "@/stores/chat-unread";

/**
 * Mounts once in the protected layout.
 * Subscribes to wf_messages INSERT events and increments the global
 * unread badge counter when a new message arrives for this user.
 * Resets the counter when the user navigates to /chat.
 */
export function ChatNotificationsProvider() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isGlobalProcedureAdmin(user);
  const { increment, reset } = useChatUnreadStore();
  const pathname = usePathname();

  // Keep a ref so the Realtime callback always sees the current path
  // without needing to rebuild the subscription on every navigation.
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Reset unread counter when the user is on the chat page.
  useEffect(() => {
    if (pathname === "/chat") reset();
  }, [pathname, reset]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!user || !supabase) return;

    // Admin listens for messages with receiver_id = null (admin channel).
    // Regular users listen for messages addressed directly to them.
    const filter = isAdmin
      ? "receiver_id=is.null"
      : `receiver_id=eq.${user.id}`;

    const channel = supabase
      .channel(`chat-notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wf_messages", filter },
        (payload) => {
          const msg = payload.new as { sender_id: string };
          // Ignore messages I sent myself.
          if (msg.sender_id === user.id) return;
          // Only badge when not already on the chat page.
          if (!pathnameRef.current.startsWith("/chat")) increment();
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user, isAdmin, increment]);

  return null;
}
