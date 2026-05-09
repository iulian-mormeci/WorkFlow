"use client";

import { useEffect, useRef } from "react";
import { db } from "@/lib/db/workflow-db";
import { getSupportEmailTo } from "@/lib/support-email/config";
import { getReminderDefaultEmail } from "@/lib/reminders/config";
import { reminderAckIso, shouldFireReminder } from "@/lib/reminders/reminder-utils";

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

async function maybeNotifyPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }
}

export function useInterventionReminders(enabled = true) {
  const busy = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    async function tick() {
      if (busy.current) return;
      busy.current = true;
      try {
        const list = await db.interventions.toArray();
        const dueSoon = list.some((i) => i.remindersEnabled && i.dueAt && i.status !== "completed");
        if (dueSoon) await maybeNotifyPermission();

        const nowIso = new Date().toISOString();
        for (const iv of list) {
          if (!shouldFireReminder(iv)) continue;

          const client = await db.clients.get(iv.clientId);
          const title = `Due: ${client?.name ?? "Client"}`;
          const body =
            iv.dueAt != null
              ? `${iv.type} — complete by ${new Date(iv.dueAt).toLocaleString()}`
              : iv.type;

          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification(title, { body, tag: `wf-rem-${iv.id}`, requireInteraction: false });
            } catch {
              /* ignore */
            }
          }

          const to = effectiveReminderEmail(iv);
          if (typeof navigator !== "undefined" && navigator.onLine && to.includes("@")) {
            try {
              await fetch("/api/reminder-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  to,
                  subject: `[WorkFlow] ${title}`,
                  text: `${body}\n\nOpen WorkFlow to update this intervention.`
                })
              });
            } catch {
              /* best-effort; local notification still counts as delivered */
            }
          }

          await db.interventions.update(iv.id, {
            reminderLastFireAt: reminderAckIso(iv),
            updatedAt: nowIso
          });
        }
      } finally {
        busy.current = false;
      }
    }

    const id = window.setInterval(tick, 45000);
    void tick();
    return () => window.clearInterval(id);
  }, [enabled]);
}
