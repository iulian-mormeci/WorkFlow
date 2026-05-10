"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/db/workflow-db";
import type { Intervention } from "@/lib/db/workflow-db";
import { getSupportEmailTo } from "@/lib/support-email/config";
import { getReminderDefaultEmail } from "@/lib/reminders/config";
import {
  getInterventionReminderDecision,
  getReminderScheduledFireMs,
  interventionHasPreDueAck,
  parseReminderLastFireMs,
  reminderAckAtIso
} from "@/lib/reminders/reminder-utils";
import { isInterventionCompleted } from "@/lib/interventions/intervention-helpers";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";

/** Poll interval for intervention due reminders (browser + email). */
export const INTERVENTION_REMINDER_POLL_MS = 45_000;

let notificationPermissionPrompts = 0;
const MAX_NOTIFICATION_PROMPTS = 4;

function effectiveReminderEmail(intervention: {
  reminderEmailTo?: string;
}): string {
  return (
    intervention.reminderEmailTo?.trim() ||
    getReminderDefaultEmail() ||
    getSupportEmailTo() ||
    ""
  );
}

async function maybeNotifyPermission(): Promise<void> {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  if (notificationPermissionPrompts >= MAX_NOTIFICATION_PROMPTS) return;
  notificationPermissionPrompts += 1;
  try {
    await Notification.requestPermission();
    console.info("[wf-reminders] Notification.requestPermission resolved", {
      permission: Notification.permission
    });
  } catch (e) {
    console.info("[wf-reminders] Notification.requestPermission failed", e);
  }
}

async function maybeNotifyPermissionIfDueSoon(list: Intervention[]): Promise<void> {
  const dueSoon = list.some(
    (i) => i.remindersEnabled && i.dueAt && !isInterventionCompleted(i)
  );
  if (!dueSoon) return;
  await maybeNotifyPermission();
}

function reminderLogPayload(
  iv: Intervention,
  nowMs: number,
  scheduledMs: number | null
): { id: string; fireAt: string | null; lastFire: string | null; now: string; tier?: string } {
  const fireAt =
    scheduledMs != null
      ? new Date(scheduledMs).toISOString()
      : iv.dueAt != null
        ? new Date(iv.dueAt).toISOString()
        : null;
  return {
    id: iv.id,
    fireAt,
    lastFire: iv.reminderLastFireAt ?? null,
    now: new Date(nowMs).toISOString()
  };
}

export type CheckAndFireRemindersResult = {
  checkedAtIso: string;
  scanned: number;
  remindersConfigured: number;
  fired: number;
  notAckedNoDelivery: number;
};

/**
 * Loads interventions, optionally prompts for Notification permission when any
 * reminder is configured, then fires browser notifications / reminder emails and
 * acks `reminderPreDueAckAt` or `reminderDueAckAt` (tier that fired) only after successful
 * delivery, using the ack instant from {@link getInterventionReminderDecision}.
 */
export async function checkAndFireReminders(): Promise<CheckAndFireRemindersResult> {
  const checkedAtIso = new Date().toISOString();
  const nowMs = Date.now();
  const list = await db.interventions.toArray();

  await maybeNotifyPermissionIfDueSoon(list);

  const remindersConfigured = list.filter(
    (i) => i.remindersEnabled && i.dueAt && !isInterventionCompleted(i)
  ).length;

  console.info("[wf-reminders] checkAndFireReminders", {
    scanned: list.length,
    remindersConfigured,
    notificationPermission:
      typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    at: checkedAtIso
  });

  const configuredRows = list.filter(
    (i) => i.remindersEnabled && i.dueAt && !isInterventionCompleted(i)
  );
  if (configuredRows.length === 0) {
    console.info("[wf-reminders] no interventions with reminders + due date (open)");
    console.info(
      "[wf-reminders] reminder snapshot (first 10)",
      list.slice(0, 10).map((i) => ({
        id: i.id,
        status: i.status,
        dueAt: i.dueAt ?? null,
        remindersEnabled: Boolean(i.remindersEnabled),
        reminderPreset: i.reminderPreset ?? null,
        reminderCustomAt: i.reminderCustomAt ?? null,
        reminderEmailTo: i.reminderEmailTo ?? null
      }))
    );
  } else {
    for (const iv of configuredRows) {
      const scheduledMs = getReminderScheduledFireMs(iv);
      const decision = getInterventionReminderDecision(iv, nowMs);
      const base = reminderLogPayload(iv, nowMs, scheduledMs);

      console.info("[wf-reminders] tier pre_due", {
        id: iv.id,
        eligible: decision.tierLog.preDue.eligible,
        summary: decision.tierLog.preDue.summary,
        checks: decision.tierLog.preDue.checks
      });
      console.info("[wf-reminders] tier due", {
        id: iv.id,
        eligible: decision.tierLog.due.eligible,
        summary: decision.tierLog.due.summary,
        checks: decision.tierLog.due.checks
      });

      if (decision.fire) {
        const fireAtIso =
          decision.ackAtMs != null ? reminderAckAtIso(decision.ackAtMs) : base.fireAt;
        console.info(`[wf-reminders] shouldFire = true | reason: ${decision.reason}`, {
          id: base.id,
          fireAt: fireAtIso,
          lastFire: base.lastFire,
          now: base.now,
          tier: decision.tier
        });
      } else {
        console.info(`[wf-reminders] shouldFire = false | reason: ${decision.reason}`, {
          ...base,
          dueAt: iv.dueAt,
          lastFireMs: parseReminderLastFireMs(iv.reminderLastFireAt)
        });
      }
    }
  }

  let fired = 0;
  let notAckedNoDelivery = 0;
  let anyAcked = false;

  for (const iv of list) {
    const decision = getInterventionReminderDecision(iv, nowMs);
    if (!decision.fire || decision.ackAtMs == null) continue;

    fired += 1;
    const ackIso = reminderAckAtIso(decision.ackAtMs);
    const schedForLog = getReminderScheduledFireMs(iv);
    const dueMsForLog = iv.dueAt ? new Date(iv.dueAt).getTime() : NaN;
    if (
      decision.tier === "due" &&
      Number.isFinite(dueMsForLog) &&
      interventionHasPreDueAck(iv, schedForLog, dueMsForLog)
    ) {
      console.info("[wf-reminders] firing due/overdue tier even after pre-due ack", {
        id: iv.id
      });
    }

    console.info(`[wf-reminders] shouldFire = true | reason: ${decision.reason}`, {
      id: iv.id,
      fireAt: ackIso,
      lastFire: iv.reminderLastFireAt ?? null,
      now: new Date(nowMs).toISOString(),
      tier: decision.tier,
      clientId: iv.clientId
    });

    const client = await db.clients.get(iv.clientId);
    const title = `Due: ${client?.name ?? "Client"}`;
    const body =
      iv.dueAt != null
        ? `${iv.type} — complete by ${new Date(iv.dueAt).toLocaleString()}`
        : iv.type;

    let delivered = false;

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification(title, { body, tag: `wf-rem-${iv.id}`, requireInteraction: false });
        delivered = true;
        console.info("[wf-reminders] browser notification shown", { id: iv.id });
      } catch (e) {
        console.info("[wf-reminders] new Notification threw", { id: iv.id, error: e });
      }
    } else {
      console.info("[wf-reminders] browser notification skipped", {
        id: iv.id,
        permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission
      });
    }

    const to = effectiveReminderEmail(iv);
    if (typeof navigator !== "undefined" && navigator.onLine && to.includes("@")) {
      try {
        const res = await fetch("/api/reminder-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to,
            subject: `[WorkFlow] ${title}`,
            text: `${body}\n\nOpen WorkFlow to update this intervention.`
          })
        });
        if (res.ok) {
          delivered = true;
          console.info("[wf-reminders] email accepted", { id: iv.id });
        } else {
          const errText = await res.text().catch(() => "");
          console.info("[wf-reminders] email rejected", {
            id: iv.id,
            status: res.status,
            body: errText.slice(0, 240)
          });
        }
      } catch (e) {
        console.info("[wf-reminders] email fetch error", { id: iv.id, error: e });
      }
    } else {
      console.info("[wf-reminders] email skipped", {
        id: iv.id,
        online: typeof navigator !== "undefined" ? navigator.onLine : false,
        hasRecipient: to.includes("@")
      });
    }

    if (delivered) {
      await db.interventions.update(iv.id, {
        ...(decision.tier === "pre_due"
          ? { reminderPreDueAckAt: ackIso }
          : { reminderDueAckAt: ackIso }),
        updatedAt: checkedAtIso
      });
      anyAcked = true;
      console.info("[wf-reminders] acked after successful delivery (tier-specific column)", {
        id: iv.id,
        tier: decision.tier,
        ackField: decision.tier === "pre_due" ? "reminderPreDueAckAt" : "reminderDueAckAt",
        ackIso
      });
    } else {
      notAckedNoDelivery += 1;
      console.info(
        "[wf-reminders] not acked — enable browser notifications or a valid reminder email + RESEND env",
        { id: iv.id }
      );
    }
  }

  if (anyAcked) {
    try {
      scheduleWorkflowSync();
    } catch (e) {
      console.info("[wf-reminders] scheduleWorkflowSync failed", e);
    }
  }

  console.info("[wf-reminders] checkAndFireReminders done", {
    fired,
    notAckedNoDelivery,
    anyAcked
  });

  return {
    checkedAtIso,
    scanned: list.length,
    remindersConfigured,
    fired,
    notAckedNoDelivery
  };
}

export type InterventionReminderPollDebug = {
  pollIntervalSec: number;
  secondsUntilNextPoll: number;
  lastPollAt: number | null;
  lastSummary: string;
  notificationPermission: NotificationPermission | "unsupported";
};

export function useInterventionReminders(enabled = true): InterventionReminderPollDebug {
  const busy = useRef(false);
  const nextPollDeadlineRef = useRef(Date.now() + INTERVENTION_REMINDER_POLL_MS);

  const [debug, setDebug] = useState<InterventionReminderPollDebug>(() => ({
    pollIntervalSec: INTERVENTION_REMINDER_POLL_MS / 1000,
    secondsUntilNextPoll: INTERVENTION_REMINDER_POLL_MS / 1000,
    lastPollAt: null,
    lastSummary: "—",
    notificationPermission:
      typeof Notification === "undefined" ? "unsupported" : Notification.permission
  }));

  const runTick = useCallback(async () => {
    nextPollDeadlineRef.current = Date.now() + INTERVENTION_REMINDER_POLL_MS;
    if (busy.current) {
      console.info("[wf-reminders] poll skipped (previous tick still running)");
      return;
    }
    busy.current = true;
    try {
      const result = await checkAndFireReminders();
      setDebug((d) => ({
        ...d,
        lastPollAt: Date.now(),
        lastSummary: `scanned ${result.scanned}, configured ${result.remindersConfigured}, fired ${result.fired}, no-delivery ${result.notAckedNoDelivery}`,
        notificationPermission:
          typeof Notification === "undefined" ? "unsupported" : Notification.permission
      }));
    } catch (e) {
      console.info("[wf-reminders] poll error", e);
      setDebug((d) => ({
        ...d,
        lastPollAt: Date.now(),
        lastSummary: `error: ${e instanceof Error ? e.message : String(e)}`
      }));
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const pollId = window.setInterval(() => {
      void runTick();
    }, INTERVENTION_REMINDER_POLL_MS);

    void runTick();

    const countdownId = window.setInterval(() => {
      const sec = Math.max(
        0,
        Math.ceil((nextPollDeadlineRef.current - Date.now()) / 1000)
      );
      setDebug((d) => ({
        ...d,
        secondsUntilNextPoll: sec,
        notificationPermission:
          typeof Notification === "undefined" ? "unsupported" : Notification.permission
      }));
    }, 1000);

    return () => {
      window.clearInterval(pollId);
      window.clearInterval(countdownId);
    };
  }, [enabled, runTick]);

  useEffect(() => {
    if (!enabled) return;

    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        try {
          const list = await db.interventions.toArray();
          await maybeNotifyPermissionIfDueSoon(list);
          setDebug((d) => ({
            ...d,
            notificationPermission:
              typeof Notification === "undefined" ? "unsupported" : Notification.permission
          }));
        } catch (e) {
          console.info("[wf-reminders] visibility permission hook error", e);
        }
      })();
    };

    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled]);

  return debug;
}
