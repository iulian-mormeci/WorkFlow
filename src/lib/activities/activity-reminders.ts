/**
 * Reminder scheduling for Activities ("Attività").
 *
 * Two independent tiers fire at most once each:
 *  - pre_due: a configurable offset before `dueAt` (or a custom wall time)
 *  - due: at/after `dueAt`
 * Each tier tracks its own ack timestamp so a pre-due delivery never suppresses the due one.
 * Mirrors the intervention reminder model but scoped to the simpler Activity shape.
 */
import type { Activity, ReminderPreset } from "@/lib/db/workflow-db";

export function isActivityCompleted(a: Activity): boolean {
  return a.status === "completed";
}

function presetOffsetMs(preset: ReminderPreset): number | null {
  if (preset === "1d") return 86_400_000;
  if (preset === "2h") return 7_200_000;
  if (preset === "30m") return 1_800_000;
  return null;
}

export function normalizedActivityReminderPreset(a: Activity): ReminderPreset {
  const p = a.reminderPreset ?? "2h";
  if (p === "1d" || p === "2h" || p === "30m" || p === "custom") return p;
  return "2h";
}

function parseMs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const t = new Date(s).getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/**
 * Instant for the "before due" reminder (preset offset or custom wall time), clamped to
 * never exceed `dueAt`. Null when reminders are off / no due date / completed.
 */
export function getActivityReminderScheduledFireMs(a: Activity): number | null {
  if (!a.remindersEnabled || !a.dueAt || isActivityCompleted(a)) return null;
  const dueMs = new Date(a.dueAt).getTime();
  if (!Number.isFinite(dueMs)) return null;

  const preset = normalizedActivityReminderPreset(a);
  if (preset === "custom") {
    if (!a.reminderCustomAt) return null;
    const c = new Date(a.reminderCustomAt).getTime();
    if (!Number.isFinite(c)) return null;
    return Math.min(c, dueMs);
  }

  const off = presetOffsetMs(preset);
  if (off == null) return null;
  return Math.min(dueMs - off, dueMs);
}

export type ActivityReminderTier = "pre_due" | "due";

export type ActivityReminderDecision = {
  fire: boolean;
  tier?: ActivityReminderTier;
  /** ISO instant to persist as the ack for the firing tier. */
  ackAtMs?: number;
  reason: string;
};

/**
 * Decide whether (and which tier) to fire for the given instant.
 * Pre-due wins when both are eligible so the earlier notification surfaces first.
 */
export function getActivityReminderDecision(
  a: Activity,
  now = Date.now()
): ActivityReminderDecision {
  if (!a.remindersEnabled || !a.dueAt || isActivityCompleted(a)) {
    return { fire: false, reason: "reminders off, no due date, or completed" };
  }
  const dueMs = new Date(a.dueAt).getTime();
  if (!Number.isFinite(dueMs)) {
    return { fire: false, reason: "invalid dueAt" };
  }

  const scheduledMs = getActivityReminderScheduledFireMs(a);
  const preAckMs = parseMs(a.reminderPreDueAckAt);
  const dueAckMs = parseMs(a.reminderDueAckAt);

  // Pre-due tier (only when it is distinct from the due instant).
  if (scheduledMs != null && scheduledMs < dueMs) {
    const eligible = now >= scheduledMs && (preAckMs == null || preAckMs < scheduledMs);
    if (eligible) {
      return { fire: true, tier: "pre_due", ackAtMs: scheduledMs, reason: "pre_due tier due" };
    }
  }

  // Due / overdue tier.
  const dueEligible = now >= dueMs && (dueAckMs == null || dueAckMs < dueMs);
  if (dueEligible) {
    return { fire: true, tier: "due", ackAtMs: dueMs, reason: "due tier due" };
  }

  return { fire: false, reason: "no tier eligible yet" };
}

export function reminderAckAtIso(ackAtMs: number): string {
  return new Date(ackAtMs).toISOString();
}

/** True when a due date exists, is in the past, and the activity is not completed. */
export function isActivityOverdue(a: Activity, now = Date.now()): boolean {
  if (!a.dueAt || isActivityCompleted(a)) return false;
  const dueMs = new Date(a.dueAt).getTime();
  return Number.isFinite(dueMs) && dueMs <= now;
}
