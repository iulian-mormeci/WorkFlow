"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, Wrench } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBubble } from "@/components/ui/icon";
import { ViewAllLink } from "@/components/dashboard/clickable-card";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";

const LIMIT = 5;

export function WidgetRecentProcedures() {
  const t = useTranslations("dashboard.widgets.recentProcedures");
  const liveEpoch = useWorkflowLiveEpoch();

  const procedures = useLiveQuery(
    async () => db.procedures.orderBy("updatedAt").reverse().limit(LIMIT).toArray(),
    [liveEpoch]
  );

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <ViewAllLink href="/procedures" label={t("viewAll")} />
            <IconBubble icon={BookOpen} />
          </div>
        </div>
      </CardHeader>
      <div className="px-2 pb-2">
        <div className="divide-y overflow-hidden rounded-xl border">
          {(procedures ?? []).map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 px-4 py-3">
              {p.category === "brand_model" ? (
                <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{p.title}</div>
                {p.brand || p.model ? (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[p.brand, p.model].filter(Boolean).join(" · ")}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {(procedures ?? []).length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t("empty")}</div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
