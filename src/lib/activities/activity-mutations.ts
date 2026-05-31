import {
  db,
  type Activity,
  type ActivityPostponement,
  type ActivityPriority,
  type ActivityStatus,
  type ReminderPreset
} from "@/lib/db/workflow-db";

export type ActivityFormValues = {
  title: string;
  description?: string;
  /** ISO instant (date + time) or undefined when no deadline. */
  dueAt?: string;
  remindersEnabled: boolean;
  reminderPreset?: ReminderPreset;
  reminderCustomAt?: string;
  status: ActivityStatus;
  priority: ActivityPriority;
  category?: string;
};

function clean(s: string | undefined): string | undefined {
  const v = s?.trim();
  return v ? v : undefined;
}

export async function createActivity(values: ActivityFormValues): Promise<string> {
  const nowIso = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.activities.add({
    id,
    title: values.title.trim(),
    description: clean(values.description),
    dueAt: values.dueAt,
    remindersEnabled: values.remindersEnabled && Boolean(values.dueAt),
    reminderPreset: values.remindersEnabled ? values.reminderPreset ?? "2h" : undefined,
    reminderCustomAt:
      values.remindersEnabled && values.reminderPreset === "custom"
        ? values.reminderCustomAt
        : undefined,
    status: values.status,
    priority: values.priority,
    category: clean(values.category),
    createdAt: nowIso,
    updatedAt: nowIso
  });
  return id;
}

/**
 * Patch an existing activity. When the due date changes we reset reminder acks so the
 * pre-due / due notifications fire again for the new deadline.
 */
export async function updateActivity(
  current: Activity,
  values: ActivityFormValues
): Promise<void> {
  const nowIso = new Date().toISOString();
  const dueChanged = (current.dueAt ?? "") !== (values.dueAt ?? "");
  await db.activities.update(current.id, {
    title: values.title.trim(),
    description: clean(values.description),
    dueAt: values.dueAt,
    remindersEnabled: values.remindersEnabled && Boolean(values.dueAt),
    reminderPreset: values.remindersEnabled ? values.reminderPreset ?? "2h" : undefined,
    reminderCustomAt:
      values.remindersEnabled && values.reminderPreset === "custom"
        ? values.reminderCustomAt
        : undefined,
    status: values.status,
    priority: values.priority,
    category: clean(values.category),
    ...(dueChanged ? { reminderPreDueAckAt: undefined, reminderDueAckAt: undefined } : {}),
    updatedAt: nowIso
  });
}

export async function setActivityStatus(
  activity: Activity,
  status: ActivityStatus
): Promise<void> {
  await db.activities.update(activity.id, {
    status,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Record a postponement: append to the history log, move the due date forward, set the
 * status to "postponed", and reset reminder acks so reminders fire again for the new date.
 */
export async function postponeActivity(
  activity: Activity,
  params: { newDueAt?: string; reason?: string }
): Promise<void> {
  const nowIso = new Date().toISOString();
  const entry: ActivityPostponement = {
    id: crypto.randomUUID(),
    at: nowIso,
    reason: clean(params.reason),
    previousDueAt: activity.dueAt,
    newDueAt: params.newDueAt
  };
  const history = [...(activity.postponements ?? []), entry];
  await db.activities.update(activity.id, {
    status: "postponed",
    dueAt: params.newDueAt,
    postponements: history,
    reminderPreDueAckAt: undefined,
    reminderDueAckAt: undefined,
    updatedAt: nowIso
  });
}
