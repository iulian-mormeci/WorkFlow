import type { Activity, Client, Intervention } from "@/lib/db/workflow-db";
import type { CalendarEventInput } from "@/lib/calendar/ics-export";

const DEFAULT_INTERVENTION_MINUTES = 60;
const DEFAULT_ACTIVITY_MINUTES = 30;

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function interventionToCalendarEvent(
  intervention: Intervention,
  client?: Client | null
): CalendarEventInput | null {
  const startRaw = intervention.startAt ?? intervention.dueAt;
  if (!startRaw) return null;

  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) return null;

  let end: Date;
  if (intervention.endAt) {
    end = new Date(intervention.endAt);
  } else if (intervention.durationMinutes && intervention.durationMinutes > 0) {
    end = addMinutes(start, intervention.durationMinutes);
  } else {
    end = addMinutes(start, DEFAULT_INTERVENTION_MINUTES);
  }
  if (end.getTime() <= start.getTime()) {
    end = addMinutes(start, DEFAULT_INTERVENTION_MINUTES);
  }

  const clientName = client?.name ?? "Client";
  const title = `${clientName} — ${intervention.type || "Intervention"}`;
  const descriptionParts = [
    intervention.notes?.trim(),
    intervention.status ? `Status: ${intervention.status}` : undefined
  ].filter(Boolean);

  return {
    uid: intervention.id,
    title,
    description: descriptionParts.join("\n\n") || undefined,
    location: client?.address ?? client?.city ?? undefined,
    start,
    end
  };
}

export function activityToCalendarEvent(activity: Activity): CalendarEventInput | null {
  if (!activity.dueAt) return null;
  const start = new Date(activity.dueAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = addMinutes(start, DEFAULT_ACTIVITY_MINUTES);

  const descriptionParts = [
    activity.description?.trim(),
    activity.category ? `Category: ${activity.category}` : undefined,
    `Priority: ${activity.priority}`,
    `Status: ${activity.status}`
  ].filter(Boolean);

  return {
    uid: activity.id,
    title: activity.title,
    description: descriptionParts.join("\n\n") || undefined,
    start,
    end
  };
}

export function calendarFilename(prefix: string, id: string): string {
  const safe = prefix.replace(/[^\w\-]+/g, "_").slice(0, 40);
  return `workflow-${safe}-${id.slice(0, 8)}.ics`;
}
