import type { Intervention, ReminderPreset } from "@/lib/db/workflow-db";
import { isInterventionCompleted } from "@/lib/interventions/intervention-helpers";

const LEGACY_PRE_SLOP_MS = 120_000;
/** Legacy single-column ack: treat as due-tier only if within this window of `dueAt`. */
const LEGACY_DUE_WALL_MS = 5_000;

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

/** Parse reminder ack timestamps from Dexie / JSON (string | Date | number ms). */
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
 * Explicit pre-due tier ack, or legacy `reminderLastFireAt` when it clearly refers to a pre-due
 * delivery (before `dueAt`, on/near the scheduled instant).
 */
export function getResolvedPreDueAckMs(
  i: Intervention,
  scheduledMs: number | null,
  dueMs: number
): number | null {
  const explicit = parseReminderLastFireMs(i.reminderPreDueAckAt);
  if (explicit != null) return explicit;

  const leg = parseReminderLastFireMs(i.reminderLastFireAt);
  if (leg == null || scheduledMs == null) return null;
  if (leg >= dueMs - LEGACY_DUE_WALL_MS) return null;
  if (leg > scheduledMs + LEGACY_PRE_SLOP_MS) return null;
  return leg;
}

/**
 * Explicit due-tier ack, or legacy `reminderLastFireAt` when it refers to a due/overdue delivery
 * (on/near `dueAt`). Does not use the pre-due column.
 */
export function getResolvedDueAckMs(i: Intervention, dueMs: number): number | null {
  const explicit = parseReminderLastFireMs(i.reminderDueAckAt);
  if (explicit != null) return explicit;

  const leg = parseReminderLastFireMs(i.reminderLastFireAt);
  if (leg == null) return null;
  if (leg < dueMs - LEGACY_DUE_WALL_MS) return null;
  return leg;
}

/**
 * Millisecond instant for the "before due" reminder, or custom wall time, or null if not configured.
 * Clamped to never exceed `dueAt`.
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

export type ReminderTierEval = {
  eligible: boolean;
  checks: Record<string, boolean | string | null>;
  summary: string;
};

export type InterventionReminderDecision = {
  fire: boolean;
  reason: string;
  ackAtMs?: number;
  tier?: ReminderDecisionTier;
  tierLog: { preDue: ReminderTierEval; due: ReminderTierEval };
};

function evalPreDueTier(
  scheduledMs: number | null,
  dueMs: number,
  preAckMs: number | null,
  now: number
): ReminderTierEval {
  if (scheduledMs == null) {
    return {
      eligible: false,
      checks: { hasScheduledInstant: false },
      summary: "no scheduled instant (preset/custom not producing a time before due)"
    };
  }

  const distinctFromDue = scheduledMs < dueMs;
  if (!distinctFromDue) {
    return {
      eligible: false,
      checks: {
        hasScheduledInstant: true,
        scheduledIso: new Date(scheduledMs).toISOString(),
        dueIso: new Date(dueMs).toISOString(),
        sameAsDue: true
      },
      summary:
        "scheduled instant equals dueAt — pre-due tier skipped; use due tier only for this row"
    };
  }

  const nowGteScheduled = now >= scheduledMs;
  const tierNotYetAcked = preAckMs == null || preAckMs < scheduledMs;
  const eligible = nowGteScheduled && tierNotYetAcked;

  const checks: Record<string, boolean | string | null> = {
    hasScheduledInstant: true,
    scheduledIso: new Date(scheduledMs).toISOString(),
    preDueAckIso: preAckMs != null ? new Date(preAckMs).toISOString() : null,
    nowGteScheduled: nowGteScheduled,
    tierNotYetAcked
  };

  let summary: string;
  if (!nowGteScheduled) {
    summary = `waiting (now < scheduled ${new Date(scheduledMs).toISOString()})`;
  } else if (!tierNotYetAcked) {
    summary =
      "not eligible: pre_due tier already acked (reminderPreDueAckAt / legacy pre ack >= scheduled)";
  } else {
    summary =
      "eligible: now >= scheduled and pre_due tier not acked for this instant (independent of due tier ack)";
  }

  return { eligible, checks, summary };
}

function evalDueTier(
  dueMs: number,
  dueAckMs: number | null,
  now: number,
  usesSeparateDueAckField: boolean
): ReminderTierEval {
  const nowGteDue = now >= dueMs;
  const tierNotYetAcked = dueAckMs == null || dueAckMs < dueMs;
  const eligible = nowGteDue && tierNotYetAcked;

  const checks: Record<string, boolean | string | null> = {
    dueIso: new Date(dueMs).toISOString(),
    dueAckIso: dueAckMs != null ? new Date(dueAckMs).toISOString() : null,
    nowGteDue: nowGteDue,
    tierNotYetAcked,
    usesSeparateDueAckField
  };

  let summary: string;
  if (!nowGteDue) {
    summary = `waiting (now < dueAt ${new Date(dueMs).toISOString()})`;
  } else if (!tierNotYetAcked) {
    summary =
      "not eligible: due tier already acked (reminderDueAckAt / legacy due ack >= dueAt)";
  } else {
    summary =
      "eligible: now >= dueAt and due tier not acked for this instant (independent of pre_due tier ack)";
  }

  return { eligible, checks, summary };
}

function neutralTierEval(summary: string): ReminderTierEval {
  return { eligible: false, checks: { skipped: true }, summary };
}

/**
 * Pre-due and due tiers use **separate ack timestamps** (`reminderPreDueAckAt`, `reminderDueAckAt`).
 * A pre-due ack does **not** block the due tier. Legacy `reminderLastFireAt` is inferred only when
 * the new columns are absent (see `getResolvedPreDueAckMs` / `getResolvedDueAckMs`).
 */
export function getInterventionReminderDecision(
  i: Intervention,
  now = Date.now()
): InterventionReminderDecision {
  if (!i.remindersEnabled || !i.dueAt || isInterventionCompleted(i)) {
    const skip = "not evaluated (reminders off, no due, or completed)";
    return {
      fire: false,
      tierLog: { preDue: neutralTierEval(skip), due: neutralTierEval(skip) },
      reason:
        "shouldFire = false because reminders are off, there is no due date, or the visit is completed"
    };
  }

  const dueMs = new Date(i.dueAt).getTime();
  if (!Number.isFinite(dueMs)) {
    const skip = "not evaluated (invalid dueAt)";
    return {
      fire: false,
      tierLog: { preDue: neutralTierEval(skip), due: neutralTierEval(skip) },
      reason: "shouldFire = false because dueAt does not parse to a valid time"
    };
  }

  const scheduledMs = getReminderScheduledFireMs(i);
  const preAckMs = getResolvedPreDueAckMs(i, scheduledMs, dueMs);
  const dueAckMs = getResolvedDueAckMs(i, dueMs);

  const preEval = evalPreDueTier(scheduledMs, dueMs, preAckMs, now);
  const dueEval = evalDueTier(dueMs, dueAckMs, now, Boolean(i.reminderDueAckAt));

  if (preEval.eligible && scheduledMs != null) {
    return {
      fire: true,
      tier: "pre_due",
      ackAtMs: scheduledMs,
      tierLog: { preDue: preEval, due: dueEval },
      reason:
        "firing pre_due tier: ack tracked on reminderPreDueAckAt only; does not affect due tier"
    };
  }

  if (dueEval.eligible) {
    return {
      fire: true,
      tier: "due",
      ackAtMs: dueMs,
      tierLog: { preDue: preEval, due: dueEval },
      reason:
        "firing due tier: ack tracked on reminderDueAckAt only; independent of pre_due tier ack"
    };
  }

  return {
    fire: false,
    tierLog: { preDue: preEval, due: dueEval },
    reason: `shouldFire = false | pre_due: ${preEval.summary} | due: ${dueEval.summary}`
  };
}

export function shouldFireReminder(i: Intervention, now = Date.now()): boolean {
  return getInterventionReminderDecision(i, now).fire;
}

/** True if a pre-due delivery has been recorded (explicit field or resolved legacy). */
export function interventionHasPreDueAck(
  i: Intervention,
  scheduledMs: number | null,
  dueMs: number
): boolean {
  return getResolvedPreDueAckMs(i, scheduledMs, dueMs) != null;
}

/** ISO timestamp to persist after a successful delivery for the given ack instant. */
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
