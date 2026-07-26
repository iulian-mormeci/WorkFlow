"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Layers } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { GenericListWidget } from "@/components/dashboard/widgets/generic-list-widget";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";

const LIMIT = 5;

export function WidgetTemplates() {
  const t = useTranslations("dashboard.widgets.templates");
  const liveEpoch = useWorkflowLiveEpoch();
  const templates = useLiveQuery(
    async () => db.templates.orderBy("name").limit(LIMIT).toArray(),
    [liveEpoch]
  );

  return (
    <GenericListWidget
      title={t("title")}
      subtitle={t("subtitle")}
      icon={Layers}
      viewAllHref="/templates"
      viewAllLabel={t("viewAll")}
      emptyLabel={t("empty")}
      loading={templates === undefined}
      items={(templates ?? []).map((tpl) => ({
        id: tpl.id,
        title: tpl.name,
        subtitle: tpl.clientName
      }))}
    />
  );
}
