"use client";

import { useEffect, useState } from "react";
import { useInterventionReminders } from "@/hooks/use-intervention-reminders";
import { useTranslations } from "next-intl";

export function InterventionRemindersProvider() {
  const t = useTranslations();
  const debug = useInterventionReminders(true);
  const [showHud, setShowHud] = useState(
    () => process.env.NODE_ENV === "development"
  );

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage?.getItem("wf:reminderDebug") === "1") {
        setShowHud(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <>
      {showHud ? (
        <div
          className="pointer-events-none fixed bottom-3 left-3 z-[100] max-w-sm rounded-xl border bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm"
          aria-live="polite"
        >
          <div className="font-semibold text-foreground">{t("debug.reminders.title")}</div>
          <div className="mt-1 space-y-0.5 text-muted-foreground">
            <div>
              {t("debug.reminders.nextPollPrefix")}{" "}
              <span className="font-mono tabular-nums text-foreground">
                {debug.secondsUntilNextPoll}s
              </span>{" "}
              {t("debug.reminders.everySuffix", { seconds: debug.pollIntervalSec })}
            </div>
            <div>
              {t("debug.reminders.notificationsPrefix")}{" "}
              <span className="font-mono text-foreground">{debug.notificationPermission}</span>
            </div>
            <div className="break-words">
              {t("debug.reminders.lastPrefix")}{" "}
              {debug.lastPollAt
                ? new Date(debug.lastPollAt).toLocaleTimeString()
                : "—"}{" "}
              — {debug.lastSummary}
            </div>
          </div>
          <p className="mt-2 border-t pt-2 text-[10px] leading-snug text-muted-foreground">
            {t("debug.reminders.prodPrefix")}{" "}
            <span className="font-mono">
              {`localStorage.setItem("wf:reminderDebug","1")`}
            </span>{" "}
            {t("debug.reminders.prodSuffix")}
          </p>
        </div>
      ) : null}
    </>
  );
}
