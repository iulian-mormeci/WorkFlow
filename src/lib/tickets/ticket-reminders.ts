/**
 * Reminder scheduling for CRM tickets (mirrors the activity reminder model).
 *
 * Two independent tiers fire at most once each:
 *  - pre_due: a configurable offset before `dueAt` (or a custom wall time)
 *  - due: at/after `dueAt`
 * Each tier tracks its own ack so a pre-due delivery never suppresses the due one.
 */
import type { ReminderPreset, Ticket } from "@/lib/db/workflow-db";

/** Tickets are "done" when closed/completed. */
export function isTicketDone(t: Ticket): boolean {
  return t.status === "closed";
}

function presetOffsetMs(preset: ReminderPreset): number | null {
  if (preset === "1d") return 86_400_000;
  if (preset === "2h") return 7_200_000;
  if (preset === "30m") return 1_800_000;
  return null;
}

export function normalizedTicketReminderPreset(t: Ticket): ReminderPreset {
  const p = t.reminderPreset ?? "2h";
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

/** Pre-due fire instant, clamped to never exceed `dueAt`. Null when not configured. */
export function getTicketReminderScheduledFireMs(t: Ticket): number | null {
  if (!t.remindersEnabled || !t.dueAt || isTicketDone(t)) return null;
  const dueMs = new Date(t.dueAt).getTime();
  if (!Number.isFinite(dueMs)) return null;

  const preset = normalizedTicketReminderPreset(t);
  if (preset === "custom") {
    if (!t.reminderCustomAt) return null;
    const c = new Date(t.reminderCustomAt).getTime();
    if (!Number.isFinite(c)) return null;
    return Math.min(c, dueMs);
  }

  const off = presetOffsetMs(preset);
  if (off == null) return null;
  return Math.min(dueMs - off, dueMs);
}

export type TicketReminderTier = "pre_due" | "due";

export type TicketReminderDecision = {
  fire: boolean;
  tier?: TicketReminderTier;
  ackAtMs?: number;
  reason: string;
};

export function getTicketReminderDecision(
  t: Ticket,
  now = Date.now()
): TicketReminderDecision {
  if (!t.remindersEnabled || !t.dueAt || isTicketDone(t)) {
    return { fire: false, reason: "reminders off, no due date, or done" };
  }
  const dueMs = new Date(t.dueAt).getTime();
  if (!Number.isFinite(dueMs)) {
    return { fire: false, reason: "invalid dueAt" };
  }

  const scheduledMs = getTicketReminderScheduledFireMs(t);
  const preAckMs = parseMs(t.reminderPreDueAckAt);
  const dueAckMs = parseMs(t.reminderDueAckAt);

  if (scheduledMs != null && scheduledMs < dueMs) {
    const eligible = now >= scheduledMs && (preAckMs == null || preAckMs < scheduledMs);
    if (eligible) {
      return { fire: true, tier: "pre_due", ackAtMs: scheduledMs, reason: "pre_due tier due" };
    }
  }

  const dueEligible = now >= dueMs && (dueAckMs == null || dueAckMs < dueMs);
  if (dueEligible) {
    return { fire: true, tier: "due", ackAtMs: dueMs, reason: "due tier due" };
  }

  return { fire: false, reason: "no tier eligible yet" };
}

export function reminderAckAtIso(ackAtMs: number): string {
  return new Date(ackAtMs).toISOString();
}

/** True when a due date exists, is in the past, and the ticket is not done. */
export function isTicketOverdue(t: Ticket, now = Date.now()): boolean {
  if (!t.dueAt || isTicketDone(t)) return false;
  const dueMs = new Date(t.dueAt).getTime();
  return Number.isFinite(dueMs) && dueMs <= now;
}
