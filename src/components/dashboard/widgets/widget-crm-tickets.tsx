"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { MessagesSquare } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { GenericListWidget } from "@/components/dashboard/widgets/generic-list-widget";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";

const LIMIT = 5;

export function WidgetCrmTickets() {
  const t = useTranslations("dashboard.widgets.crmTickets");
  const liveEpoch = useWorkflowLiveEpoch();
  const tickets = useLiveQuery(async () => {
    const all = await db.tickets.toArray();
    return all
      .filter((tkt) => tkt.status !== "closed")
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
      .slice(0, LIMIT);
  }, [liveEpoch]);

  return (
    <GenericListWidget
      title={t("title")}
      subtitle={t("subtitle")}
      icon={MessagesSquare}
      viewAllHref="/crm-tickets"
      viewAllLabel={t("viewAll")}
      emptyLabel={t("empty")}
      loading={tickets === undefined}
      items={(tickets ?? []).map((tkt) => ({
        id: tkt.id,
        title: tkt.title,
        subtitle: t(`priority.${tkt.priority}`)
      }))}
    />
  );
}
