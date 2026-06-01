"use client";

import { Link } from "@/i18n/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Target } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ViewAllLink } from "@/components/dashboard/clickable-card";
import { DueCountdown } from "@/components/interventions/due-countdown";
import { InterventionStatusBadge } from "@/components/interventions/intervention-status-badge";
import { endOfDay, startOfDay } from "@/lib/dates";
import { useSecondTicker } from "@/hooks/use-second-ticker";
import {
  formatElapsedHms,
  getTimerElapsedSeconds,
  isInterventionCompleted,
  normalizeTimerRunState
} from "@/lib/interventions/intervention-helpers";
import { IconBubble } from "@/components/ui/icon";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";

function fmtTime(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function TodaysFocus() {
  const t = useTranslations();
  const liveEpoch = useWorkflowLiveEpoch();
  const tick = useSecondTicker(1000);
  void tick;
  const now = new Date();
  const todayStart = startOfDay(now).toISOString();
  const todayEnd = endOfDay(now).toISOString();

  const clients = useLiveQuery(async () => db.clients.toArray(), [liveEpoch]);
  const focus = useLiveQuery(async () => {
    // Include: started today OR due today OR overdue (even if unscheduled / no startAt yet).
    const all = await db.interventions.toArray();
    const nowMs = Date.now();
    const startMs = new Date(todayStart).getTime();
    const endMs = new Date(todayEnd).getTime();
    const list = all.filter((i) => {
      if (isInterventionCompleted(i)) return false;
      const startAtMs = i.startAt ? new Date(i.startAt).getTime() : NaN;
      const dueAtMs = i.dueAt ? new Date(i.dueAt).getTime() : NaN;
      const startedToday = Number.isFinite(startAtMs) && startAtMs >= startMs && startAtMs <= endMs;
      const dueToday = Number.isFinite(dueAtMs) && dueAtMs >= startMs && dueAtMs <= endMs;
      const overdue = Number.isFinite(dueAtMs) && dueAtMs < nowMs;
      return startedToday || dueToday || overdue;
    });
    return list
      .sort((a, b) => {
        const br = normalizeTimerRunState(b) === "running" ? 1 : 0;
        const ar = normalizeTimerRunState(a) === "running" ? 1 : 0;
        if (br !== ar) return br - ar;
        return (b.startAt ?? "").localeCompare(a.startAt ?? "");
      })
      .slice(0, 6);
  }, [todayStart, todayEnd, liveEpoch]);

  const clientById = new Map(clients?.map((c) => [c.id, c.name]) ?? []);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
              <CardTitle className="text-base">{t("dashboard.todaysFocus.title")}</CardTitle>
              <CardDescription>{t("dashboard.todaysFocus.subtitle")}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <ViewAllLink href="/interventions" label={t("dashboard.viewAll")} />
            <IconBubble icon={Target} />
          </div>
        </div>
      </CardHeader>

      <div className="px-2 pb-2">
        <div className="divide-y overflow-hidden rounded-xl border">
          {(focus ?? []).map((it) => (
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
                    {fmtTime(it.startAt) ? (
                      <>
                        {fmtTime(it.startAt)} •{" "}
                      </>
                    ) : (
                      <>
                        {t("common.noTime")} •{" "}
                      </>
                    )}
                    {(it.workCategory ?? "intervention") === "activity" ? t("common.activityPrefix") : ""}
                    {it.type ?? t("common.intervention")}
                    {it.dueAt && !isInterventionCompleted(it) ? (
                      <>
                        {" "}
                        · <DueCountdown intervention={it} />
                      </>
                    ) : null}
                    {normalizeTimerRunState(it) === "running" ? (
                      <>
                        {" "}
                        · <span className="font-mono">{formatElapsedHms(getTimerElapsedSeconds(it))}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <InterventionStatusBadge intervention={it} />
              </div>
            </Link>
          ))}

          {(focus ?? []).length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("dashboard.todaysFocus.empty")}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

