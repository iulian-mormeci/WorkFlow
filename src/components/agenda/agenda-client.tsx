"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { AgendaListView } from "@/components/agenda/agenda-list-view";
import { CalendarMonthView } from "@/components/agenda/calendar-month-view";
import { CalendarWeekView } from "@/components/agenda/calendar-week-view";
import { CalendarYearView } from "@/components/agenda/calendar-year-view";
import { AgendaCreateFlow } from "@/components/agenda/agenda-create-flow";
import { ActivityFormDialog } from "@/components/activities/activity-form-dialog";
import { UnoErpEventDetailDialog } from "@/components/agenda/unoerp-event-detail-dialog";
import type { CalendarEvent } from "@/lib/calendar/use-calendar-events";
import { useUnoErpEventsStore } from "@/stores/unoerp-events";

type AgendaView = "list" | "week" | "month" | "year";
const VALID_VIEWS: readonly AgendaView[] = ["list", "week", "month", "year"];

/** Next quarter-hour from now — a sensible default when creating without a specific slot. */
function nextQuarterHour(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
  return d;
}

function parseDateParam(value: string | null): Date {
  if (value) {
    const [y, m, d] = value.split("-").map(Number);
    if (y && m && d) {
      const parsed = new Date(y, m - 1, d);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return new Date();
}

function formatDateParam(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function AgendaClient() {
  const t = useTranslations("agenda");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read the starting view/date straight from the URL so that navigating away
  // (e.g. opening an intervention's detail page) and back restores exactly
  // where the user was, instead of resetting to the default list view.
  const [view, setView] = useState<AgendaView>(() => {
    const v = searchParams.get("view");
    return (VALID_VIEWS as readonly string[]).includes(v ?? "") ? (v as AgendaView) : "list";
  });
  const [cursor, setCursor] = useState<Date>(() => parseDateParam(searchParams.get("date")));
  const [createPrefill, setCreatePrefill] = useState<Date | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [viewingUnoErpEvent, setViewingUnoErpEvent] = useState<CalendarEvent | null>(null);
  const hasUnoErpEvents = useUnoErpEventsStore((s) => s.events.length > 0);
  const unoErpVisible = useUnoErpEventsStore((s) => s.visible);
  const setUnoErpVisible = useUnoErpEventsStore((s) => s.setVisible);

  const editingActivity = useLiveQuery(
    async () => (editingActivityId ? await db.activities.get(editingActivityId) : undefined),
    [editingActivityId]
  );

  /**
   * Single entry point for changing view and/or cursor: updates both React
   * state and the URL atomically from explicit values, never from stale
   * closures — avoids the two updates racing and overwriting each other
   * when a click changes both at once (e.g. picking a day in Month view).
   */
  const navigate = (nextView: AgendaView, nextCursor?: Date) => {
    const resolvedCursor = nextCursor ?? cursor;
    setView(nextView);
    if (nextCursor) setCursor(nextCursor);

    const params = new URLSearchParams();
    params.set("view", nextView);
    if (nextView !== "list") params.set("date", formatDateParam(resolvedCursor));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const views: { id: AgendaView; label: string }[] = [
    { id: "list", label: t("views.list") },
    { id: "week", label: t("views.week") },
    { id: "month", label: t("views.month") },
    { id: "year", label: t("views.year") }
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto rounded-xl border bg-muted/30 p-1">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => navigate(v.id)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                view === v.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {hasUnoErpEvents && (
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={unoErpVisible}
                onChange={(e) => setUnoErpVisible(e.target.checked)}
              />
              {t("unoerp.toggleLabel")}
            </label>
          )}
          <Button type="button" size="sm" onClick={() => setCreatePrefill(nextQuarterHour())}>
            <Plus className="h-4 w-4" />
            {t("create.newButton")}
          </Button>
        </div>
      </div>

      {view === "list" && (
        <AgendaListView onOpenActivity={setEditingActivityId} onOpenUnoErp={setViewingUnoErpEvent} />
      )}
      {view === "week" && (
        <CalendarWeekView
          cursor={cursor}
          onCursorChange={(d) => navigate("week", d)}
          onOpenActivity={setEditingActivityId}
          onOpenUnoErp={setViewingUnoErpEvent}
          onRequestCreate={setCreatePrefill}
        />
      )}
      {view === "month" && (
        <CalendarMonthView
          cursor={cursor}
          onCursorChange={(d) => navigate("month", d)}
          onOpenActivity={setEditingActivityId}
          onOpenUnoErp={setViewingUnoErpEvent}
          onRequestCreate={setCreatePrefill}
          onSelectDay={(d) => navigate("week", d)}
        />
      )}
      {view === "year" && (
        <CalendarYearView
          cursor={cursor}
          onCursorChange={(d) => navigate("year", d)}
          onSelectMonth={(d) => navigate("month", d)}
          onSelectDay={(d) => navigate("week", d)}
        />
      )}

      <AgendaCreateFlow prefillDate={createPrefill} onClose={() => setCreatePrefill(null)} />

      <ActivityFormDialog
        open={Boolean(editingActivityId) && editingActivity !== undefined}
        onOpenChange={(o) => {
          if (!o) setEditingActivityId(null);
        }}
        activity={editingActivity ?? null}
      />

      <UnoErpEventDetailDialog
        event={viewingUnoErpEvent}
        onOpenChange={(o) => {
          if (!o) setViewingUnoErpEvent(null);
        }}
      />
    </div>
  );
}
