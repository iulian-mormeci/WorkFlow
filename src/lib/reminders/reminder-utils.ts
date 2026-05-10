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
 * Never returns a time after `dueAt` (clamp) so we never wait past the visit deadline for a first ping.
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

export type InterventionReminderDecision = {
  fire: boolean;
  /** Human-readable; includes "shouldFire = true because …" when fire is true */
  reason: string;
  /** Wall instant to persist on successful delivery (ties to this logical reminder) */
  ackAtMs?: number;
};

/**
 * Two-tier reminders for open interventions:
 * 1) Pre-due: fire when now >= scheduled (offset before due, or custom) and last ack < that instant.
 * 2) Overdue: if due passed and pre-due was already acked, fire once more when last ack < dueAt.
 * If there is no valid schedule (e.g. custom missing), fire once at/after due when last < due.
 */
export function getInterventionReminderDecision(
  i: Intervention,
  now = Date.now()
): InterventionReminderDecision {
  if (!i.remindersEnabled || !i.dueAt || isInterventionCompleted(i)) {
    return {
      fire: false,
      reason: "shouldFire = false because reminders are off, there is no due date, or the visit is completed"
    };
  }

  const dueMs = new Date(i.dueAt).getTime();
  if (!Number.isFinite(dueMs)) {
    return { fire: false, reason: "shouldFire = false because dueAt does not parse to a valid time" };
  }

  const scheduledMs = getReminderScheduledFireMs(i);
  let lastMs = parseReminderLastFireMs(i.reminderLastFireAt);
  // Ignore corrupt ack timestamps after the due instant on still-open jobs (stale sync / bad data).
  if (lastMs != null && lastMs > dueMs) {
    lastMs = null;
  }

  // No valid pre-due/custom schedule → single shot at due / overdue
  if (scheduledMs == null) {
    if (now < dueMs) {
      return {
        fire: false,
        reason: `shouldFire = false because now is before due (${new Date(dueMs).toISOString()}) and there is no valid reminder schedule (set a preset or custom time)`
      };
    }
    if (lastMs != null && lastMs >= dueMs) {
      return {
        fire: false,
        reason: `shouldFire = false because already acked for due/overdue (lastFire >= due)`
      };
    }
    return {
      fire: true,
      ackAtMs: dueMs,
      reason: `shouldFire = true because now >= due (${new Date(dueMs).toISOString()}) and reminderLastFireAt is null or before due (no separate schedule)`
    };
  }

  // Tier 1 — pre-due (scheduled instant)
  if (now >= scheduledMs && (lastMs == null || lastMs < scheduledMs)) {
    return {
      fire: true,
      ackAtMs: scheduledMs,
      reason: `shouldFire = true because now >= scheduled fire time (${new Date(scheduledMs).toISOString()}) and (reminderLastFireAt is null or < that instant)`
    };
  }

  // Tier 2 — overdue nudge at due (after pre-due was acked)
  if (
    now >= dueMs &&
    lastMs != null &&
    lastMs >= scheduledMs &&
    lastMs < dueMs
  ) {
    return {
      fire: true,
      ackAtMs: dueMs,
      reason: `shouldFire = true because the visit is due or overdue (due ${new Date(dueMs).toISOString()}), pre-due reminder was already acked, and last ack is still before due (overdue nudge)`
    };
  }

  if (now < scheduledMs) {
    return {
      fire: false,
      reason: `shouldFire = false because now is before scheduled reminder (${new Date(scheduledMs).toISOString()})`
    };
  }

  if (lastMs != null && lastMs >= dueMs) {
    return {
      fire: false,
      reason: "shouldFire = false because due/overdue reminder was already acked (lastFire >= due)"
    };
  }

  return {
    fire: false,
    reason: `shouldFire = false because waiting after pre-due ack (scheduled was ${new Date(scheduledMs).toISOString()}, lastFire ${lastMs != null ? new Date(lastMs).toISOString() : "none"})`
  };
}

export function shouldFireReminder(i: Intervention, now = Date.now()): boolean {
  return getInterventionReminderDecision(i, now).fire;
}

/** ISO timestamp to store after a successful delivery for the given ack instant. */
export function reminderAckAtIso(ackAtMs: number): string {
  return new Date(ackAtMs).toISOString();
}

/** Legacy: ack instant for current schedule (no “now” context). Prefer reminderAckAtIso(decision.ackAtMs). */
export function reminderAckIso(i: Intervention): string {
  const ms = getReminderScheduledFireMs(i);
  if (ms != null) return reminderAckAtIso(ms);
  if (i.dueAt) {
    const d = new Date(i.dueAt).getTime();
    if (Number.isFinite(d)) return reminderAckAtIso(d);
  }
  return new Date().toISOString();
}
