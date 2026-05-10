import { db } from "@/lib/db/workflow-db";
import { purgeInterventionLocallyById } from "@/lib/interventions/delete-intervention";

/**
 * Removes a client from Dexie and reconciles dependents:
 * interventions (purge each), ticket client links, template default client.
 * Safe when the client row is already gone (e.g. out-of-order realtime).
 */
export async function purgeClientLocallyById(clientId: string): Promise<void> {
  const interventions = await db.interventions.where("clientId").equals(clientId).toArray();
  for (const iv of interventions) {
    await purgeInterventionLocallyById(iv.id);
  }

  const nowIso = new Date().toISOString();
  const tickets = await db.tickets.filter((t) => t.clientId === clientId).toArray();
  for (const t of tickets) {
    await db.tickets.where("id").equals(t.id).modify((row) => {
      delete row.clientId;
      row.updatedAt = nowIso;
    });
  }

  const templates = await db.templates.filter((t) => t.defaultClientId === clientId).toArray();
  for (const t of templates) {
    await db.templates.where("id").equals(t.id).modify((row) => {
      delete row.defaultClientId;
      row.updatedAt = nowIso;
    });
  }

  await db.clients.delete(clientId);
}
