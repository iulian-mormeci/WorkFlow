import { db } from "@/lib/db/workflow-db";

/**
 * Permanently removes an intervention and related rows from Dexie.
 * Order: outbox → documents → stock movements → ticket links → attachments → intervention.
 */
export async function deleteInterventionWithRelations(
  interventionId: string
): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.interventions,
      db.attachments,
      db.documents,
      db.stockMovements,
      db.tickets,
      db.supportEmailOutbox
    ],
    async () => {
      const iv = await db.interventions.get(interventionId);
      if (!iv) {
        throw new Error("Intervention not found");
      }

      const attachmentIds = new Set<string>();
      for (const id of iv.photoIds ?? []) {
        if (id) attachmentIds.add(id);
      }
      for (const id of iv.voiceNoteIds ?? []) {
        if (id) attachmentIds.add(id);
      }

      for (const docId of iv.documentIds ?? []) {
        const doc = await db.documents.get(docId);
        if (doc) {
          if (doc.attachmentId) attachmentIds.add(doc.attachmentId);
          await db.documents.delete(docId);
        }
      }

      const outboxRows = await db.supportEmailOutbox
        .where("interventionId")
        .equals(interventionId)
        .toArray();
      for (const row of outboxRows) {
        if (row.attachmentId) attachmentIds.add(row.attachmentId);
        await db.supportEmailOutbox.delete(row.id);
      }

      await db.stockMovements
        .where("interventionId")
        .equals(interventionId)
        .delete();

      const tickets = await db.tickets
        .where("interventionId")
        .equals(interventionId)
        .toArray();
      const nowIso = new Date().toISOString();
      for (const t of tickets) {
        await db.tickets.update(t.id, {
          interventionId: undefined,
          updatedAt: nowIso
        });
      }

      for (const aid of attachmentIds) {
        try {
          await db.attachments.delete(aid);
        } catch {
          // ignore missing / already removed
        }
      }

      await db.interventions.delete(interventionId);
    }
  );
}

/**
 * Removes an intervention and dependents from Dexie even when the intervention row
 * is already gone (e.g. realtime DELETE arrived out of order).
 */
export async function purgeInterventionLocallyById(interventionId: string): Promise<void> {
  const iv = await db.interventions.get(interventionId);
  if (iv) {
    await deleteInterventionWithRelations(interventionId);
    return;
  }

  await db.transaction(
    "rw",
    [
      db.interventions,
      db.attachments,
      db.documents,
      db.stockMovements,
      db.tickets,
      db.supportEmailOutbox
    ],
    async () => {
      const attachmentIds = new Set<string>();

      const docs = await db.documents
        .where("interventionId")
        .equals(interventionId)
        .toArray();
      for (const d of docs) {
        if (d.attachmentId) attachmentIds.add(d.attachmentId);
        await db.documents.delete(d.id);
      }

      const outboxRows = await db.supportEmailOutbox
        .where("interventionId")
        .equals(interventionId)
        .toArray();
      for (const row of outboxRows) {
        if (row.attachmentId) attachmentIds.add(row.attachmentId);
        await db.supportEmailOutbox.delete(row.id);
      }

      await db.stockMovements.where("interventionId").equals(interventionId).delete();

      const tickets = await db.tickets
        .where("interventionId")
        .equals(interventionId)
        .toArray();
      const nowIso = new Date().toISOString();
      for (const t of tickets) {
        await db.tickets.update(t.id, {
          interventionId: undefined,
          updatedAt: nowIso
        });
      }

      for (const aid of attachmentIds) {
        try {
          await db.attachments.delete(aid);
        } catch {
          // ignore missing
        }
      }

      try {
        await db.interventions.delete(interventionId);
      } catch {
        // ignore missing
      }
    }
  );
}
