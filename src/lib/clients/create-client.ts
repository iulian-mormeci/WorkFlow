import { db } from "@/lib/db/workflow-db";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";

export async function createClientByName(nameRaw: string): Promise<string> {
  const name = nameRaw.trim();
  if (name.length < 2) throw new Error("workflow.i18n:clientNameTooShort");

  const existing = await db.clients.filter((c) => c.name.trim().toLowerCase() === name.toLowerCase()).first();
  if (existing) return existing.id;

  const nowIso = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.clients.add({
    id,
    name,
    clientType: "other",
    createdAt: nowIso,
    updatedAt: nowIso
  });
  scheduleWorkflowSync();
  return id;
}
