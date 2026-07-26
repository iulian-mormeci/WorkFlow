"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { FileScan } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { GenericListWidget } from "@/components/dashboard/widgets/generic-list-widget";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";

const LIMIT = 5;

export function WidgetDocuments() {
  const t = useTranslations("dashboard.widgets.documents");
  const liveEpoch = useWorkflowLiveEpoch();
  const documents = useLiveQuery(
    async () => db.documents.orderBy("createdAt").reverse().limit(LIMIT).toArray(),
    [liveEpoch]
  );

  return (
    <GenericListWidget
      title={t("title")}
      subtitle={t("subtitle")}
      icon={FileScan}
      viewAllHref="/documents"
      viewAllLabel={t("viewAll")}
      emptyLabel={t("empty")}
      loading={documents === undefined}
      items={(documents ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        href: `/documents/${d.id}`
      }))}
    />
  );
}
