"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { GenericListWidget, type GenericListItem } from "@/components/dashboard/widgets/generic-list-widget";
import { useChatUnreadStore } from "@/stores/chat-unread";
import { useTranslations } from "next-intl";

const LIMIT = 5;

export function WidgetChat() {
  const t = useTranslations("dashboard.widgets.chat");
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const unread = useChatUnreadStore((s) => s.count);
  const [items, setItems] = useState<GenericListItem[] | null>(null);

  useEffect(() => {
    if (!supabase) {
      setItems([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setItems([]);
        return;
      }
      const { data } = await supabase
        .from("wf_messages")
        .select("id, sender_id, content, created_at")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (!cancelled) {
        setItems(
          (data ?? []).map((m) => ({
            id: m.id as string,
            title: (m.content as string).slice(0, 80),
            subtitle: new Date(m.created_at as string).toLocaleString(undefined, {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit"
            })
          }))
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <GenericListWidget
      title={t("title")}
      subtitle={unread > 0 ? t("subtitleUnread", { count: unread }) : t("subtitle")}
      icon={MessageCircle}
      viewAllHref="/chat"
      viewAllLabel={t("viewAll")}
      emptyLabel={t("empty")}
      loading={items === null}
      items={items ?? []}
    />
  );
}
