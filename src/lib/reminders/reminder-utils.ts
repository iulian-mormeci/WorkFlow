import type { Intervention, ReminderPreset } from "@/lib/db/workflow-db";

function presetOffsetMs(preset: ReminderPreset): number | null {
  if (preset === "1d") return 86400000;
  if (preset === "2h") return 7200000;
  if (preset === "30m") return 1800000;
  return null;
}

/** Absolute instant when the reminder should fire (once), or null if disabled / invalid. */
export function getReminderFireAt(i: Intervention): Date | null {
  if (!i.remindersEnabled || !i.dueAt || i.status === "completed") return null;
  const due = new Date(i.dueAt).getTime();
  if (!Number.isFinite(due)) return null;

  const preset = i.reminderPreset ?? "2h";
  if (preset === "custom") {
    if (!i.reminderCustomAt) return null;
    const t = new Date(i.reminderCustomAt).getTime();
    return Number.isFinite(t) ? new Date(t) : null;
  }

  const off = presetOffsetMs(preset);
  if (off == null) return null;
  return new Date(due - off);
}

export function shouldFireReminder(i: Intervention, now = Date.now()): boolean {
  const fireAt = getReminderFireAt(i);
  if (!fireAt) return false;
  if (now < fireAt.getTime()) return false;
  if (i.reminderLastFireAt) {
    const last = new Date(i.reminderLastFireAt).getTime();
    if (Number.isFinite(last) && last >= fireAt.getTime()) return false;
  }
  return true;
}

/** Call after handling a reminder so the same scheduled instant does not repeat. */
export function reminderAckIso(i: Intervention): string {
  const fireAt = getReminderFireAt(i);
  return fireAt ? fireAt.toISOString() : new Date().toISOString();
}
