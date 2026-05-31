"use client";

import { useTicketReminders } from "@/hooks/use-ticket-reminders";

/** Mounts the CRM ticket reminder poller (browser notifications). Renders nothing. */
export function TicketRemindersProvider() {
  useTicketReminders(true);
  return null;
}
