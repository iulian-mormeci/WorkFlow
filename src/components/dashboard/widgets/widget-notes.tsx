"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { NotebookPen } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { GenericListWidget } from "@/components/dashboard/widgets/generic-list-widget";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";

const LIMIT = 5;

export function WidgetNotes() {
  const t = useTranslations("dashboard.widgets.notes");
  const liveEpoch = useWorkflowLiveEpoch();
  const notes = useLiveQuery(
    async () => db.notes.orderBy("updatedAt").reverse().limit(LIMIT).toArray(),
    [liveEpoch]
  );

  return (
    <GenericListWidget
      title={t("title")}
      subtitle={t("subtitle")}
      icon={NotebookPen}
      viewAllHref="/notes"
      viewAllLabel={t("viewAll")}
      emptyLabel={t("empty")}
      loading={notes === undefined}
      items={(notes ?? []).map((n) => ({ id: n.id, title: n.title || t("untitled") }))}
    />
  );
}
