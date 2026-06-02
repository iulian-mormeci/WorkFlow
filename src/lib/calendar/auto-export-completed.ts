import { db } from "@/lib/db/workflow-db";
import {
  activityToCalendarEvent,
  calendarFilename,
  interventionToCalendarEvent
} from "@/lib/calendar/calendar-events";
import { buildIcs, downloadIcsFile } from "@/lib/calendar/ics-export";
import { getUserPreferences } from "@/lib/user-settings/user-preferences";

export async function maybeAutoExportCompletedIntervention(
  interventionId: string,
  userId?: string | null
): Promise<boolean> {
  if (!userId) return false;
  const prefs = await getUserPreferences(userId);
  if (!prefs.calendarAutoExportCompleted) return false;

  const intervention = await db.interventions.get(interventionId);
  if (!intervention || intervention.status !== "completed") return false;

  const client = intervention.clientId
    ? await db.clients.get(intervention.clientId)
    : undefined;
  const event = interventionToCalendarEvent(intervention, client);
  if (!event) return false;

  const ics = buildIcs(event);
  downloadIcsFile(calendarFilename(client?.name ?? "intervention", intervention.id), ics);
  return true;
}

export async function maybeAutoExportCompletedActivity(
  activityId: string,
  userId?: string | null
): Promise<boolean> {
  if (!userId) return false;
  const prefs = await getUserPreferences(userId);
  if (!prefs.calendarAutoExportCompleted) return false;

  const activity = await db.activities.get(activityId);
  if (!activity || activity.status !== "completed" || !activity.dueAt) return false;

  const event = activityToCalendarEvent(activity);
  if (!event) return false;

  const ics = buildIcs(event);
  downloadIcsFile(calendarFilename(activity.title, activity.id), ics);
  return true;
}
