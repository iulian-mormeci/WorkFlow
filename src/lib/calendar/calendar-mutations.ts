import { db } from "@/lib/db/workflow-db";
import { updateActivity } from "@/lib/activities/activity-mutations";

/**
 * Calendar drag/resize persistence. Writes go straight through Dexie like
 * every other edit path in this app (form dialogs included) — the sync
 * engine's Dexie hooks (`registerWorkflowDexieSyncHooks`) already schedule a
 * push on every create/update/delete, so no manual sync call is needed here.
 */

export async function moveInterventionById(id: string, newStart: Date): Promise<void> {
  const it = await db.interventions.get(id);
  if (!it) return;
  const nowIso = new Date().toISOString();
  if (it.startAt) {
    // Scheduled item: shift the whole block, keeping its duration.
    const deltaMs = newStart.getTime() - new Date(it.startAt).getTime();
    const newEndIso = it.endAt ? new Date(new Date(it.endAt).getTime() + deltaMs).toISOString() : it.endAt;
    await db.interventions.update(id, {
      startAt: newStart.toISOString(),
      endAt: newEndIso,
      updatedAt: nowIso
    });
  } else {
    // Unscheduled to-do (only had a deadline): dragging just moves the deadline.
    await db.interventions.update(id, { dueAt: newStart.toISOString(), updatedAt: nowIso });
  }
}

export async function resizeInterventionById(id: string, newEnd: Date): Promise<void> {
  const it = await db.interventions.get(id);
  if (!it?.startAt) return;
  const startMs = new Date(it.startAt).getTime();
  const durationMinutes = Math.max(15, Math.round((newEnd.getTime() - startMs) / 60_000));
  await db.interventions.update(id, {
    endAt: new Date(startMs + durationMinutes * 60_000).toISOString(),
    durationMinutes,
    updatedAt: new Date().toISOString()
  });
}

export async function moveActivityById(id: string, newStart: Date): Promise<void> {
  const a = await db.activities.get(id);
  if (!a) return;
  await updateActivity(a, {
    title: a.title,
    description: a.description,
    dueAt: newStart.toISOString(),
    remindersEnabled: Boolean(a.remindersEnabled),
    reminderPreset: a.reminderPreset,
    reminderCustomAt: a.reminderCustomAt,
    status: a.status,
    priority: a.priority,
    category: a.category
  });
}
