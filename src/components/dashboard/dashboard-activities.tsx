"use client";

import { Link } from "@/i18n/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ListTodo } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/workflow-db";
import { endOfDay, startOfDay } from "@/lib/dates";
import { IconBubble } from "@/components/ui/icon";
import { CLICKABLE_CARD } from "@/components/dashboard/clickable-card";
import { isActivityCompleted, isActivityOverdue } from "@/lib/activities/activity-reminders";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";

export function DashboardActivities() {
  const t = useTranslations();
  const liveEpoch = useWorkflowLiveEpoch();
  const now = new Date();
  const todayStart = startOfDay(now).toISOString();
  const todayEnd = endOfDay(now).toISOString();

  const counts = useLiveQuery(async () => {
    const all = await db.activities.toArray();
    const startMs = new Date(todayStart).getTime();
    const endMs = new Date(todayEnd).getTime();
    const nowMs = Date.now();

    let open = 0;
    let overdue = 0;
    let dueToday = 0;
    for (const a of all) {
      if (isActivityCompleted(a)) continue;
      open += 1;
      if (isActivityOverdue(a, nowMs)) overdue += 1;
      if (a.dueAt) {
        const dueMs = new Date(a.dueAt).getTime();
        if (Number.isFinite(dueMs) && dueMs >= startMs && dueMs <= endMs) dueToday += 1;
      }
    }
    return { open, overdue, dueToday };
  }, [todayStart, todayEnd, liveEpoch]);

  const stats = [
    { label: t("dashboard.activities.open"), value: counts?.open ?? "—", tone: "text-foreground" },
    { label: t("dashboard.activities.overdue"), value: counts?.overdue ?? "—", tone: "text-destructive" },
    { label: t("dashboard.activities.dueToday"), value: counts?.dueToday ?? "—", tone: "text-primary" }
  ] as const;

  return (
    <Link
      href="/activities"
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <Card className={`rounded-2xl ${CLICKABLE_CARD}`}>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{t("dashboard.activities.title")}</CardTitle>
              <CardDescription>{t("dashboard.activities.subtitle")}</CardDescription>
            </div>
            <IconBubble icon={ListTodo} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border bg-muted/30 px-3 py-3 text-center">
                <div className={`text-2xl font-semibold tabular-nums sm:text-3xl ${s.tone}`}>
                  {s.value}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}
