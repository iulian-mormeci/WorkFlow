import { db } from "@/lib/db/workflow-db";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";

const OFFICE_CLIENT_NAME = "Ufficio interno";

/** Stable internal client for office / activity work items without a customer. */
export async function getOrCreateOfficeClientId(): Promise<string> {
  const existing = await db.clients.filter((c) => c.name.trim().toLowerCase() === OFFICE_CLIENT_NAME.toLowerCase()).first();
  if (existing) return existing.id;

  const nowIso = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.clients.add({
    id,
    name: OFFICE_CLIENT_NAME,
    clientType: "other",
    createdAt: nowIso,
    updatedAt: nowIso
  });
  scheduleWorkflowSync();
  return id;
}
