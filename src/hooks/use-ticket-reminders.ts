"use client";

import { useCallback, useEffect, useRef } from "react";
import { db, type Ticket } from "@/lib/db/workflow-db";
import {
  getTicketReminderDecision,
  isTicketDone,
  reminderAckAtIso
} from "@/lib/tickets/ticket-reminders";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";

/** Poll interval for ticket due reminders (browser notifications). */
export const TICKET_REMINDER_POLL_MS = 45_000;

let notificationPermissionPrompts = 0;
const MAX_NOTIFICATION_PROMPTS = 4;

async function maybeRequestNotificationPermission(): Promise<void> {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  if (notificationPermissionPrompts >= MAX_NOTIFICATION_PROMPTS) return;
  notificationPermissionPrompts += 1;
  try {
    await Notification.requestPermission();
  } catch {
    /* user/browser may reject silently */
  }
}

function showBrowserNotification(t: Ticket, tier: "pre_due" | "due") {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const body =
    t.dueAt != null
      ? tier === "pre_due"
        ? `Due ${new Date(t.dueAt).toLocaleString()}`
        : `Due now — ${new Date(t.dueAt).toLocaleString()}`
      : t.description ?? "";
  try {
    new Notification(t.title, {
      body,
      tag: `wf-ticket-${t.id}-${tier}`,
      requireInteraction: false
    });
  } catch {
    /* ignore notification construction errors */
  }
}

/**
 * Polls Dexie for tickets whose reminder should fire, shows a browser notification,
 * and acks the firing tier so it won't repeat. Mirrors the activity/intervention pollers.
 */
export function useTicketReminders(enabled = true): void {
  const busy = useRef(false);

  const runTick = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const list = await db.tickets.toArray();
      const hasConfigured = list.some(
        (t) => t.remindersEnabled && t.dueAt && !isTicketDone(t)
      );
      if (hasConfigured) await maybeRequestNotificationPermission();

      const nowMs = Date.now();
      const checkedAtIso = new Date().toISOString();
      let anyAcked = false;

      for (const t of list) {
        const decision = getTicketReminderDecision(t, nowMs);
        if (!decision.fire || decision.ackAtMs == null || !decision.tier) continue;

        showBrowserNotification(t, decision.tier);
        const ackIso = reminderAckAtIso(decision.ackAtMs);
        await db.tickets.update(t.id, {
          ...(decision.tier === "pre_due"
            ? { reminderPreDueAckAt: ackIso }
            : { reminderDueAckAt: ackIso }),
          updatedAt: checkedAtIso
        });
        anyAcked = true;
      }

      if (anyAcked) {
        try {
          scheduleWorkflowSync();
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      console.info("[wf-ticket-reminders] tick error", e);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void runTick();
    const pollId = window.setInterval(() => void runTick(), TICKET_REMINDER_POLL_MS);
    return () => window.clearInterval(pollId);
  }, [enabled, runTick]);
}
