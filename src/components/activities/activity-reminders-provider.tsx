"use client";

import { useState } from "react";
import { AlarmClock, CheckCircle2 } from "lucide-react";
import type { Activity } from "@/lib/db/workflow-db";
import { useActivityReminders } from "@/hooks/use-activity-reminders";
import { setActivityStatus } from "@/lib/activities/activity-mutations";
import { ActivityPostponeDialog } from "@/components/activities/activity-postpone-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useTranslations } from "next-intl";

/**
 * Mounts the activity reminder poller. When a reminder fires it shows a browser
 * notification (handled in the hook) and surfaces an in-app prompt so the user can
 * postpone the activity (with a note) or mark it done — even without OS notifications.
 */
export function ActivityRemindersProvider() {
  const t = useTranslations();
  const { dueQueue, dismiss, reload } = useActivityReminders(true);
  const [postponeFor, setPostponeFor] = useState<Activity | null>(null);

  const current = dueQueue[0] ?? null;
  const promptOpen = Boolean(current) && !postponeFor;

  async function markDone(a: Activity) {
    try {
      await setActivityStatus(a, "completed");
    } catch {
      /* offline-first: state still updates locally on retry */
    }
    dismiss(a.id);
  }

  return (
    <>
      <Dialog
        open={promptOpen}
        onOpenChange={(o) => {
          if (!o && current) dismiss(current.id);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlarmClock className="h-5 w-5 text-primary" />
              {t("activities.reminderPrompt.title")}
            </DialogTitle>
            <DialogDescription>{t("activities.reminderPrompt.subtitle")}</DialogDescription>
          </DialogHeader>

          {current ? (
            <div className="mt-3 space-y-2">
              <div className="rounded-xl border bg-muted/40 p-3">
                <div className="text-base font-semibold">{current.title}</div>
                {current.description ? (
                  <div className="mt-1 text-sm text-muted-foreground">{current.description}</div>
                ) : null}
                {current.dueAt ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {t("activities.reminderPrompt.duePrefix")}{" "}
                    {new Date(current.dueAt).toLocaleString()}
                  </div>
                ) : null}
                {dueQueue.length > 1 ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {t("activities.reminderPrompt.more", { count: dueQueue.length - 1 })}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => dismiss(current.id)}>
                  {t("activities.reminderPrompt.dismiss")}
                </Button>
                <Button variant="outline" onClick={() => setPostponeFor(current)}>
                  <AlarmClock className="h-4 w-4" />
                  {t("activities.actions.postpone")}
                </Button>
                <Button onClick={() => markDone(current)}>
                  <CheckCircle2 className="h-4 w-4" />
                  {t("activities.actions.complete")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ActivityPostponeDialog
        open={Boolean(postponeFor)}
        onOpenChange={(o) => {
          if (!o) setPostponeFor(null);
        }}
        activity={postponeFor}
        onPostponed={() => {
          if (postponeFor) dismiss(postponeFor.id);
          setPostponeFor(null);
          void reload();
        }}
      />
    </>
  );
}
