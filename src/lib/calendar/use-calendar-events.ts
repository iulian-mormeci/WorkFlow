"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/workflow-db";
import { isInterventionCompleted } from "@/lib/interventions/intervention-helpers";
import { isActivityCompleted } from "@/lib/activities/activity-reminders";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useUnoErpEventsStore } from "@/stores/unoerp-events";
import { unoErpToCalendarEvent } from "@/lib/unoerp/calendar-event";

export type CalendarEvent = {
  id: string;
  kind: "intervention" | "activity" | "unoerp";
  title: string;
  subtitle?: string;
  /** Free-text notes (intervention) or description (activity) — shown in the hover tooltip. */
  description?: string;
  start: Date;
  end: Date;
  /** The real deadline (intervention.dueAt / activity.dueAt), shown in the hover tooltip — distinct from `start` when an intervention is scheduled well before its due date. */
  dueAt?: Date;
  /** Only true for scheduled interventions (real startAt + endAt/durationMinutes) — the only events that can be resized. */
  hasRealDuration: boolean;
  completed: boolean;
  href: string;
  /** All fields below are `kind: "unoerp"` only — synced read-only from the ERP. */
  allDay?: boolean;
  color?: string;
  category?: string;
  priority?: string;
  ticketType?: string;
};

type RawCalendarEvent = Omit<CalendarEvent, "subtitle"> & { clientId?: string };

const DEFAULT_BLOCK_MINUTES = 45;

/**
 * Every intervention/activity with a date anchor (startAt, or dueAt as a
 * fallback for unscheduled interventions), normalized for Month/Week/Year
 * calendar rendering. Unlike the Agenda list view, this includes completed
 * items too — a real calendar is also a record of what happened.
 */
export function useCalendarEvents(): CalendarEvent[] | undefined {
  const liveEpoch = useWorkflowLiveEpoch();

  const clients = useLiveQuery(async () => db.clients.toArray(), [liveEpoch]);
  const clientById = new Map(clients?.map((c) => [c.id, c.name]) ?? []);

  const raw = useLiveQuery(async (): Promise<RawCalendarEvent[]> => {
    const [interventions, activities] = await Promise.all([
      db.interventions.toArray(),
      db.activities.toArray()
    ]);

    const events: RawCalendarEvent[] = [];

    for (const it of interventions) {
      const anchorIso = it.startAt ?? it.dueAt;
      if (!anchorIso) continue;
      const start = new Date(anchorIso);
      if (Number.isNaN(start.getTime())) continue;

      const hasRealDuration = Boolean(it.startAt);
      let end: Date;
      if (it.startAt && it.endAt) {
        end = new Date(it.endAt);
      } else if (it.startAt && it.durationMinutes) {
        end = new Date(start.getTime() + it.durationMinutes * 60_000);
      } else {
        end = new Date(start.getTime() + DEFAULT_BLOCK_MINUTES * 60_000);
      }
      if (end.getTime() <= start.getTime()) end = new Date(start.getTime() + 15 * 60_000);

      events.push({
        id: it.id,
        kind: "intervention",
        title: it.type || "",
        description: it.notes,
        clientId: it.clientId,
        start,
        end,
        dueAt: it.dueAt ? new Date(it.dueAt) : undefined,
        hasRealDuration,
        completed: isInterventionCompleted(it),
        href: `/interventions/${it.id}`
      });
    }

    for (const a of activities) {
      if (!a.dueAt) continue;
      const start = new Date(a.dueAt);
      if (Number.isNaN(start.getTime())) continue;
      events.push({
        id: a.id,
        kind: "activity",
        title: a.title,
        description: a.description,
        start,
        end: new Date(start.getTime() + DEFAULT_BLOCK_MINUTES * 60_000),
        dueAt: start,
        hasRealDuration: false,
        completed: isActivityCompleted(a),
        href: "/activities"
      });
    }

    return events;
  }, [liveEpoch]);

  const unoErpEvents = useUnoErpEventsStore((s) => s.events);
  const unoErpVisible = useUnoErpEventsStore((s) => s.visible);

  if (!raw) return undefined;
  const mapped = raw.map(({ clientId, ...rest }) => ({
    ...rest,
    subtitle: clientId ? clientById.get(clientId) : undefined
  }));
  if (!unoErpVisible || unoErpEvents.length === 0) return mapped;

  return [...mapped, ...unoErpEvents.map(unoErpToCalendarEvent)];
}
