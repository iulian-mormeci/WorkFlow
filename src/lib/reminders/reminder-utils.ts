import type { Intervention, ReminderPreset } from "@/lib/db/workflow-db";
import { isInterventionCompleted } from "@/lib/interventions/intervention-helpers";

function presetOffsetMs(preset: ReminderPreset): number | null {
  if (preset === "1d") return 86400000;
  if (preset === "2h") return 7200000;
  if (preset === "30m") return 1800000;
  return null;
}

/** Accept only known presets; bad DB values fall back to 2h. */
export function normalizedReminderPreset(i: Intervention): ReminderPreset {
  const p = i.reminderPreset ?? "2h";
  if (p === "1d" || p === "2h" || p === "30m" || p === "custom") return p;
  return "2h";
}

/** Parse `reminderLastFireAt` from Dexie / JSON (string | Date | number ms). */
export function parseReminderLastFireMs(v: unknown): number | null {
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
 * Millisecond instant for the "before due" reminder, or custom wall time, or null if not configured.
 * Clamped to never exceed `dueAt` so the pre-due tier never schedules after the visit deadline.
 */
export function getReminderScheduledFireMs(i: Intervention): number | null {
  if (!i.remindersEnabled || !i.dueAt || isInterventionCompleted(i)) return null;
  const dueMs = new Date(i.dueAt).getTime();
  if (!Number.isFinite(dueMs)) return null;

  const preset = normalizedReminderPreset(i);
  if (preset === "custom") {
    if (!i.reminderCustomAt) return null;
    const c = new Date(i.reminderCustomAt).getTime();
    if (!Number.isFinite(c)) return null;
    return Math.min(c, dueMs);
  }

  const off = presetOffsetMs(preset);
  if (off == null) return null;
  return Math.min(dueMs - off, dueMs);
}

/** @deprecated Prefer getInterventionReminderDecision / getReminderScheduledFireMs */
export function getReminderFireAt(i: Intervention): Date | null {
  const ms = getReminderScheduledFireMs(i);
  return ms != null ? new Date(ms) : null;
}

export type ReminderDecisionTier = "pre_due" | "due";

export type InterventionReminderDecision = {
  fire: boolean;
  reason: string;
  /** Instant to persist after a successful delivery for this tier */
  ackAtMs?: number;
  tier?: ReminderDecisionTier;
};

/**
 * Two independent rules (single stored `reminderLastFireAt`, compared per tier with strict `<`):
 *
 * 1) Pre-due: `now >= scheduledFire` AND (`lastFire` is null OR `lastFire < scheduledFire`)
 * 2) Due / overdue: `now >= dueAt` AND (`lastFire` is null OR `lastFire < dueAt`)
 *
 * If both match in the same tick, pre-due wins so we ack the scheduled instant first; the next poll
 * can take the due tier because then `lastFire === scheduled` still satisfies `lastFire < dueAt`.
 */
export function getInterventionReminderDecision(
  i: Intervention,
  now = Date.now()
): InterventionReminderDecision {
  if (!i.remindersEnabled || !i.dueAt || isInterventionCompleted(i)) {
    return {
      fire: false,
      reason:
        "shouldFire = false because reminders are off, there is no due date, or the visit is completed"
    };
  }

  const dueMs = new Date(i.dueAt).getTime();
  if (!Number.isFinite(dueMs)) {
    return { fire: false, reason: "shouldFire = false because dueAt does not parse to a valid time" };
  }

  const lastMs = parseReminderLastFireMs(i.reminderLastFireAt);
  const scheduledMs = getReminderScheduledFireMs(i);

  const preDueEligible =
    scheduledMs != null &&
    now >= scheduledMs &&
    (lastMs == null || lastMs < scheduledMs);

  const overdueEligible = now >= dueMs && (lastMs == null || lastMs < dueMs);

  if (preDueEligible && scheduledMs != null) {
    return {
      fire: true,
      tier: "pre_due",
      ackAtMs: scheduledMs,
      reason:
        "pre-due: now >= scheduled fire time and lastFire < scheduled (or no lastFire)"
    };
  }

  if (overdueEligible) {
    return {
      fire: true,
      tier: "due",
      ackAtMs: dueMs,
      reason: "due/overdue: now >= dueAt and lastFire < dueAt (or no lastFire)"
    };
  }

  if (scheduledMs != null && now < scheduledMs) {
    return {
      fire: false,
      reason: `shouldFire = false because now is before scheduled fire time (${new Date(scheduledMs).toISOString()})`
    };
  }

  if (now < dueMs) {
    if (scheduledMs != null && lastMs != null && lastMs >= scheduledMs) {
      return {
        fire: false,
        reason:
          "shouldFire = false because pre-due tier is already acked (lastFire >= scheduled) and now is still before dueAt"
      };
    }
    return {
      fire: false,
      reason: "shouldFire = false because now is before dueAt and pre-due rule does not apply"
    };
  }

  if (lastMs != null && lastMs >= dueMs) {
    return {
      fire: false,
      reason:
        "shouldFire = false because lastFire >= dueAt (due/overdue tier already acked)"
    };
  }

  return {
    fire: false,
    reason: `shouldFire = false (unmatched: scheduled=${scheduledMs != null ? new Date(scheduledMs).toISOString() : "none"} due=${new Date(dueMs).toISOString()} last=${lastMs != null ? new Date(lastMs).toISOString() : "none"})`
  };
}

export function shouldFireReminder(i: Intervention, now = Date.now()): boolean {
  return getInterventionReminderDecision(i, now).fire;
}

/** ISO timestamp to store after a successful delivery for the given ack instant. */
export function reminderAckAtIso(ackAtMs: number): string {
  return new Date(ackAtMs).toISOString();
}

/** Legacy: default ack instant for schedule/due without a live decision. Prefer reminderAckAtIso(decision.ackAtMs). */
export function reminderAckIso(i: Intervention): string {
  const ms = getReminderScheduledFireMs(i);
  if (ms != null) return reminderAckAtIso(ms);
  if (i.dueAt) {
    const d = new Date(i.dueAt).getTime();
    if (Number.isFinite(d)) return reminderAckAtIso(d);
  }
  return new Date().toISOString();
}
