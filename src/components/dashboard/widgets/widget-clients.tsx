"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Users } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { GenericListWidget } from "@/components/dashboard/widgets/generic-list-widget";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";

const LIMIT = 5;

export function WidgetClients() {
  const t = useTranslations("dashboard.widgets.clients");
  const liveEpoch = useWorkflowLiveEpoch();
  const clients = useLiveQuery(
    async () => db.clients.orderBy("updatedAt").reverse().limit(LIMIT).toArray(),
    [liveEpoch]
  );

  return (
    <GenericListWidget
      title={t("title")}
      subtitle={t("subtitle")}
      icon={Users}
      viewAllHref="/clients"
      viewAllLabel={t("viewAll")}
      emptyLabel={t("empty")}
      loading={clients === undefined}
      items={(clients ?? []).map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: c.city,
        href: `/clients/${c.id}`
      }))}
    />
  );
}
