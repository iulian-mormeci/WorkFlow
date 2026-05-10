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

/** Per-tier evaluation; tiers are independent (each compares `lastFire` only to its own threshold). */
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
  /** Always set for debugging / hook logs */
  tierLog: { preDue: ReminderTierEval; due: ReminderTierEval };
};

function evalPreDueTier(
  scheduledMs: number | null,
  dueMs: number,
  lastMs: number | null,
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
  const lastOk = lastMs == null || lastMs < scheduledMs;
  const eligible = nowGteScheduled && lastOk;

  const checks: Record<string, boolean | string | null> = {
    hasScheduledInstant: true,
    scheduledIso: new Date(scheduledMs).toISOString(),
    nowGteScheduled: nowGteScheduled,
    lastIsNullOrLtScheduled: lastOk,
    lastIso: lastMs != null ? new Date(lastMs).toISOString() : null
  };

  let summary: string;
  if (!nowGteScheduled) {
    summary = `waiting (now < scheduled ${new Date(scheduledMs).toISOString()})`;
  } else if (!lastOk) {
    summary =
      "not eligible: lastFire >= scheduled (pre-due already acked for this instant — due tier is evaluated separately)";
  } else {
    summary = "eligible: now >= scheduled and (lastFire == null or lastFire < scheduled)";
  }

  return { eligible, checks, summary };
}

function evalDueTier(dueMs: number, lastMs: number | null, now: number): ReminderTierEval {
  const nowGteDue = now >= dueMs;
  const lastOk = lastMs == null || lastMs < dueMs;
  const eligible = nowGteDue && lastOk;

  const checks: Record<string, boolean | string | null> = {
    dueIso: new Date(dueMs).toISOString(),
    nowGteDue: nowGteDue,
    lastIsNullOrLtDue: lastOk,
    lastIso: lastMs != null ? new Date(lastMs).toISOString() : null
  };

  let summary: string;
  if (!nowGteDue) {
    summary = `waiting (now < dueAt ${new Date(dueMs).toISOString()})`;
  } else if (!lastOk) {
    summary =
      "not eligible: lastFire >= dueAt (due/overdue tier already acked for this instant)";
  } else {
    summary = "eligible: now >= dueAt and (lastFire == null or lastFire < dueAt)";
  }

  return { eligible, checks, summary };
}

/**
 * Pre-due and due tiers are **independent**: each only compares `reminderLastFireAt` to its own
 * threshold (`< scheduled` vs `< dueAt`). Pre-due ack does not block due tier while `lastFire < dueAt`.
 *
 * If both tiers are eligible in one tick, **pre-due runs first** (ack = scheduled), then the next
 * poll can take **due** while `lastFire` is still `< dueAt`.
 *
 * When scheduled equals due (clamp edge), only the **due** tier applies.
 */
function neutralTierEval(summary: string): ReminderTierEval {
  return { eligible: false, checks: { skipped: true }, summary };
}

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

  const lastMs = parseReminderLastFireMs(i.reminderLastFireAt);
  const scheduledMs = getReminderScheduledFireMs(i);

  const preEval = evalPreDueTier(scheduledMs, dueMs, lastMs, now);
  const dueEval = evalDueTier(dueMs, lastMs, now);

  if (preEval.eligible && scheduledMs != null) {
    return {
      fire: true,
      tier: "pre_due",
      ackAtMs: scheduledMs,
      tierLog: { preDue: preEval, due: dueEval },
      reason:
        "firing pre_due tier: now >= scheduled and (lastFire == null or lastFire < scheduled); ack will be scheduled instant only"
    };
  }

  if (dueEval.eligible) {
    return {
      fire: true,
      tier: "due",
      ackAtMs: dueMs,
      tierLog: { preDue: preEval, due: dueEval },
      reason:
        "firing due tier: now >= dueAt and (lastFire == null or lastFire < dueAt); ack will be dueAt instant only (independent of pre-due ack)"
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
