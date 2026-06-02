"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/workflow-db";
import { applyWorkingHoursFromUserSettingsRow } from "@/lib/user-settings/working-hours-sync";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";

/** Keeps the timer memory cache in sync when user settings change via Dexie/realtime. */
export function WorkingHoursHydrator() {
  const liveEpoch = useWorkflowLiveEpoch();
  const row = useLiveQuery(async () => db.userSettings.toCollection().first(), [liveEpoch]);

  useEffect(() => {
    if (row?.workingHours) applyWorkingHoursFromUserSettingsRow(row);
  }, [row]);

  return null;
}
