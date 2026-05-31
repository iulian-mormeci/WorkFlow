import {
  db,
  type ReminderPreset,
  type Ticket,
  type TicketPriority,
  type TicketStatus
} from "@/lib/db/workflow-db";

export type TicketFormValues = {
  title: string;
  description?: string;
  priority: TicketPriority;
  status: TicketStatus;
  /** ISO instant (date + time) or undefined when no deadline. */
  dueAt?: string;
  remindersEnabled: boolean;
  reminderPreset?: ReminderPreset;
  reminderCustomAt?: string;
  interventionId?: string;
  clientId?: string;
};

function clean(s: string | undefined): string | undefined {
  const v = s?.trim();
  return v ? v : undefined;
}

export async function createTicket(values: TicketFormValues): Promise<string> {
  const nowIso = new Date().toISOString();
  const id = crypto.randomUUID();
  const remindersEnabled = values.remindersEnabled && Boolean(values.dueAt);
  await db.tickets.add({
    id,
    title: values.title.trim(),
    description: clean(values.description),
    priority: values.priority,
    status: values.status,
    dueAt: values.dueAt,
    // Keep legacy reminderAt aligned with dueAt for dashboard "due" detection.
    reminderAt: values.dueAt,
    remindersEnabled,
    reminderPreset: remindersEnabled ? values.reminderPreset ?? "2h" : undefined,
    reminderCustomAt:
      remindersEnabled && values.reminderPreset === "custom"
        ? values.reminderCustomAt
        : undefined,
    interventionId: clean(values.interventionId),
    clientId: clean(values.clientId),
    createdAt: nowIso,
    updatedAt: nowIso
  });
  return id;
}

/**
 * Patch an existing ticket. Changing the due date resets reminder acks so the
 * pre-due / due notifications fire again for the new deadline.
 */
export async function updateTicket(
  current: Ticket,
  values: TicketFormValues
): Promise<void> {
  const nowIso = new Date().toISOString();
  const dueChanged = (current.dueAt ?? "") !== (values.dueAt ?? "");
  const remindersEnabled = values.remindersEnabled && Boolean(values.dueAt);
  await db.tickets.update(current.id, {
    title: values.title.trim(),
    description: clean(values.description),
    priority: values.priority,
    status: values.status,
    dueAt: values.dueAt,
    reminderAt: values.dueAt,
    remindersEnabled,
    reminderPreset: remindersEnabled ? values.reminderPreset ?? "2h" : undefined,
    reminderCustomAt:
      remindersEnabled && values.reminderPreset === "custom"
        ? values.reminderCustomAt
        : undefined,
    interventionId: clean(values.interventionId),
    clientId: clean(values.clientId),
    ...(dueChanged ? { reminderPreDueAckAt: undefined, reminderDueAckAt: undefined } : {}),
    updatedAt: nowIso
  });
}

/** Quick action: cycle open → pending → closed → open. */
export function nextTicketStatus(status: TicketStatus): TicketStatus {
  if (status === "open") return "pending";
  if (status === "pending") return "closed";
  return "open";
}

export async function setTicketStatus(
  ticket: Ticket,
  status: TicketStatus
): Promise<void> {
  await db.tickets.update(ticket.id, {
    status,
    updatedAt: new Date().toISOString()
  });
}
