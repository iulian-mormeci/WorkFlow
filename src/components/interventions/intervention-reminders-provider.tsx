"use client";

import { useInterventionReminders } from "@/hooks/use-intervention-reminders";

export function InterventionRemindersProvider() {
  useInterventionReminders(true);
  return null;
}
