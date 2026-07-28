"use client";

import { Link } from "@/i18n/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarClock, ClipboardList, ListTodo, Globe } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBubble } from "@/components/ui/icon";
import { isInterventionCompleted } from "@/lib/interventions/intervention-helpers";
import { isActivityCompleted } from "@/lib/activities/activity-reminders";
import { startOfDay } from "@/lib/dates";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useUnoErpEventsStore } from "@/stores/unoerp-events";
import { unoErpToCalendarEvent } from "@/lib/unoerp/calendar-event";
import type { CalendarEvent } from "@/lib/calendar/use-calendar-events";
import { useTranslations } from "next-intl";

const AGENDA_WINDOW_DAYS = 14;

type AgendaEntry = {
  id: string;
  kind: "intervention" | "activity" | "unoerp";
  dateIso: string;
  title: string;
  subtitle?: string;
  /** Interventions link straight to their detail page; activities/unoerp events open in a dialog instead. */
  href?: string;
  /** Set only for kind "unoerp" — the full event, needed by the read-only detail dialog. */
  unoErpEvent?: CalendarEvent;
};

function dayKey(iso: string) {
  return startOfDay(new Date(iso)).toISOString();
}

export function AgendaListView({
  onOpenActivity,
  onOpenUnoErp
}: {
  onOpenActivity: (id: string) => void;
  onOpenUnoErp: (event: CalendarEvent) => void;
}) {
  const t = useTranslations("agenda");
  const liveEpoch = useWorkflowLiveEpoch();
  const unoErpEvents = useUnoErpEventsStore((s) => s.events);
  const unoErpVisible = useUnoErpEventsStore((s) => s.visible);

  const clients = useLiveQuery(async () => db.clients.toArray(), [liveEpoch]);
  const clientById = new Map(clients?.map((c) => [c.id, c.name]) ?? []);

  const entries = useLiveQuery(async () => {
    const [interventions, activities] = await Promise.all([
      db.interventions.toArray(),
      db.activities.toArray()
    ]);

    const now = Date.now();
    const horizon = now + AGENDA_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    const list: AgendaEntry[] = [];

    for (const it of interventions) {
      if (isInterventionCompleted(it)) continue;
      const dateIso = it.startAt ?? it.dueAt;
      if (!dateIso) continue;
      const ms = new Date(dateIso).getTime();
      if (!Number.isFinite(ms) || ms > horizon) continue;
      list.push({
        id: it.id,
        kind: "intervention",
        dateIso,
        title: it.type || t("untitledIntervention"),
        subtitle: clientById.get(it.clientId),
        href: `/interventions/${it.id}`
      });
    }

    for (const a of activities) {
      if (isActivityCompleted(a)) continue;
      if (!a.dueAt) continue;
      const ms = new Date(a.dueAt).getTime();
      if (!Number.isFinite(ms) || ms > horizon) continue;
      list.push({
        id: a.id,
        kind: "activity",
        dateIso: a.dueAt,
        title: a.title
      });
    }

    if (unoErpVisible) {
      for (const e of unoErpEvents) {
        const ms = e.start.getTime();
        if (!Number.isFinite(ms) || ms > horizon) continue;
        list.push({
          id: e.id,
          kind: "unoerp",
          dateIso: e.start.toISOString(),
          title: e.title,
          subtitle: e.subtitle,
          unoErpEvent: unoErpToCalendarEvent(e)
        });
      }
    }

    return list.sort((x, y) => x.dateIso.localeCompare(y.dateIso));
  }, [clientById.size, liveEpoch, unoErpEvents, unoErpVisible]);

  const groups: { key: string; label: string; items: AgendaEntry[] }[] = [];
  const today = startOfDay(new Date()).toISOString();
  const tomorrow = startOfDay(new Date(Date.now() + 24 * 60 * 60 * 1000)).toISOString();

  for (const entry of entries ?? []) {
    const key = dayKey(entry.dateIso);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      const isPast = key < today;
      const label = isPast
        ? t("overdue")
        : key === today
          ? t("today")
          : key === tomorrow
            ? t("tomorrow")
            : new Date(entry.dateIso).toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long"
              });
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push(entry);
  }
  groups.sort((a, b) => a.key.localeCompare(b.key));

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("card.title")}</CardTitle>
            <CardDescription>{t("card.subtitle", { days: AGENDA_WINDOW_DAYS })}</CardDescription>
          </div>
          <IconBubble icon={CalendarClock} />
        </div>
      </CardHeader>

      <div className="space-y-4 px-3 pb-4 md:px-4">
        {groups.length === 0 && (
          <div className="rounded-xl border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </div>
        )}

        {groups.map((group) => (
          <div key={group.key} className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </div>
            <div className="divide-y overflow-hidden rounded-xl border">
              {group.items.map((entry) => {
                const content = (
                  <div className="flex min-w-0 items-center gap-2.5">
                    {entry.kind === "intervention" ? (
                      <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : entry.kind === "unoerp" ? (
                      <Globe className="h-4 w-4 shrink-0 text-violet-600" />
                    ) : (
                      <ListTodo className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {entry.kind === "unoerp" && (
                          <span className="shrink-0 rounded-sm bg-violet-100 px-1 text-[9px] font-bold uppercase tracking-wide text-violet-900 dark:bg-violet-950 dark:text-violet-100">
                            ERP
                          </span>
                        )}
                        <div className="truncate text-sm font-semibold">{entry.title || "—"}</div>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(entry.dateIso).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                        {entry.subtitle ? <> · {entry.subtitle}</> : null}
                      </div>
                    </div>
                  </div>
                );
                const rowClassName =
                  "flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";
                return entry.kind === "intervention" ? (
                  <Link key={`${entry.kind}-${entry.id}`} href={entry.href!} className={rowClassName}>
                    {content}
                  </Link>
                ) : entry.kind === "unoerp" ? (
                  <button
                    key={`${entry.kind}-${entry.id}`}
                    type="button"
                    onClick={() => entry.unoErpEvent && onOpenUnoErp(entry.unoErpEvent)}
                    className={rowClassName}
                  >
                    {content}
                  </button>
                ) : (
                  <button
                    key={`${entry.kind}-${entry.id}`}
                    type="button"
                    onClick={() => onOpenActivity(entry.id)}
                    className={rowClassName}
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
