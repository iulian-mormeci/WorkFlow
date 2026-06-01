"use client";

import { Link } from "@/i18n/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/workflow-db";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ViewAllLink } from "@/components/dashboard/clickable-card";
import { InterventionStatusBadge } from "@/components/interventions/intervention-status-badge";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";

function fmt(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function DashboardRecent() {
  const t = useTranslations();
  const liveEpoch = useWorkflowLiveEpoch();
  const clients = useLiveQuery(async () => db.clients.toArray(), [liveEpoch]);
  const recent = useLiveQuery(async () => {
    return await db.interventions.orderBy("startAt").reverse().limit(6).toArray();
  }, [liveEpoch]);

  const clientById = new Map(clients?.map((c) => [c.id, c.name]) ?? []);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{t("dashboard.recent.title")}</CardTitle>
            <CardDescription>{t("dashboard.recent.subtitle")}</CardDescription>
          </div>
          <ViewAllLink href="/interventions" label={t("dashboard.viewAll")} />
        </div>
      </CardHeader>

      <div className="px-2 pb-2">
        <div className="divide-y overflow-hidden rounded-xl border">
          {(recent ?? []).map((it) => (
            <Link
              key={it.id}
              href={`/interventions/${it.id}`}
              className="block px-4 py-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {clientById.get(it.clientId) ?? t("common.client")}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {fmt(it.startAt) ? (
                      <>
                        {fmt(it.startAt)} •{" "}
                      </>
                    ) : (
                      <>
                        {t("common.noDate")} •{" "}
                      </>
                    )}
                    {(it.workCategory ?? "intervention") === "activity" ? t("common.activityPrefix") : ""}
                    {it.type ?? t("common.intervention")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <InterventionStatusBadge intervention={it} />
                  <div className="text-xs text-muted-foreground">
                    {it.durationMinutes != null
                      ? t("common.minutesShort", { minutes: it.durationMinutes })
                      : "—"}
                  </div>
                </div>
              </div>
            </Link>
          ))}

          {(recent ?? []).length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("dashboard.recent.empty")}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

