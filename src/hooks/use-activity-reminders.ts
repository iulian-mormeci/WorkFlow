"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { db, type Activity } from "@/lib/db/workflow-db";
import {
  getActivityReminderDecision,
  isActivityCompleted,
  reminderAckAtIso
} from "@/lib/activities/activity-reminders";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";

/** Poll interval for activity due reminders (browser notifications + in-app prompt). */
export const ACTIVITY_REMINDER_POLL_MS = 45_000;

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

function showBrowserNotification(a: Activity, tier: "pre_due" | "due") {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const body =
    a.dueAt != null
      ? tier === "pre_due"
        ? `Due ${new Date(a.dueAt).toLocaleString()}`
        : `Due now — ${new Date(a.dueAt).toLocaleString()}`
      : a.description ?? "";
  try {
    new Notification(a.title, {
      body,
      tag: `wf-activity-${a.id}-${tier}`,
      requireInteraction: false
    });
  } catch {
    /* ignore notification construction errors */
  }
}

export type ActivityRemindersController = {
  /** Activities that have fired this session and still need the user's attention. */
  dueQueue: Activity[];
  /** Remove an activity from the in-app prompt (e.g. after the user handled it). */
  dismiss: (id: string) => void;
  /** Force a re-read of Dexie to refresh queued items (after edits/postpone). */
  reload: () => Promise<void>;
};

/**
 * Polls Dexie for activities whose reminder should fire, shows a browser notification,
 * acks the firing tier so it won't repeat, and surfaces the activity in an in-app queue
 * so the user can postpone (with a note) or mark it handled.
 */
export function useActivityReminders(enabled = true): ActivityRemindersController {
  const busy = useRef(false);
  const firedIds = useRef<Set<string>>(new Set());
  const [dueQueue, setDueQueue] = useState<Activity[]>([]);

  const recomputeQueue = useCallback(async () => {
    const ids = [...firedIds.current];
    if (ids.length === 0) {
      setDueQueue((prev) => (prev.length ? [] : prev));
      return;
    }
    const rows: Activity[] = [];
    for (const id of ids) {
      const a = await db.activities.get(id);
      if (!a || isActivityCompleted(a)) {
        firedIds.current.delete(id);
        continue;
      }
      rows.push(a);
    }
    rows.sort((x, y) => (x.dueAt ?? "").localeCompare(y.dueAt ?? ""));
    setDueQueue(rows);
  }, []);

  const runTick = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const list = await db.activities.toArray();
      const hasConfigured = list.some(
        (a) => a.remindersEnabled && a.dueAt && !isActivityCompleted(a)
      );
      if (hasConfigured) await maybeRequestNotificationPermission();

      const nowMs = Date.now();
      let anyAcked = false;
      const checkedAtIso = new Date().toISOString();

      for (const a of list) {
        const decision = getActivityReminderDecision(a, nowMs);
        if (!decision.fire || decision.ackAtMs == null || !decision.tier) continue;

        showBrowserNotification(a, decision.tier);
        firedIds.current.add(a.id);

        const ackIso = reminderAckAtIso(decision.ackAtMs);
        await db.activities.update(a.id, {
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

      await recomputeQueue();
    } catch (e) {
      console.info("[wf-activity-reminders] tick error", e);
    } finally {
      busy.current = false;
    }
  }, [recomputeQueue]);

  const dismiss = useCallback((id: string) => {
    firedIds.current.delete(id);
    setDueQueue((prev) => prev.filter((a) => a.id !== id));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void runTick();
    const pollId = window.setInterval(() => void runTick(), ACTIVITY_REMINDER_POLL_MS);
    return () => window.clearInterval(pollId);
  }, [enabled, runTick]);

  return { dueQueue, dismiss, reload: recomputeQueue };
}
