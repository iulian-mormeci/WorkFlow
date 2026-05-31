import { db } from "@/lib/db/workflow-db";

/** Single stock movement row (Dexie only). */
export async function purgeStockMovementLocallyById(id: string): Promise<void> {
  await db.stockMovements.delete(id);
}

export async function purgeTicketLocallyById(id: string): Promise<void> {
  await db.tickets.delete(id);
}

export async function purgeActivityLocallyById(id: string): Promise<void> {
  await db.activities.delete(id);
}

export async function purgeTemplateLocallyById(id: string): Promise<void> {
  await db.templates.delete(id);
}

export async function purgeOutboxLocallyById(id: string): Promise<void> {
  await db.supportEmailOutbox.delete(id);
}

/** Matches server ON DELETE CASCADE on wf_stock_movements.spare_part_id. */
export async function purgeSparePartLocallyById(sparePartId: string): Promise<void> {
  await db.stockMovements.where("sparePartId").equals(sparePartId).delete();
  await db.spareParts.delete(sparePartId);
}

/**
 * Removes a document locally, patches parent intervention `documentIds`, and deletes the
 * PDF attachment blob when no other document references it.
 */
export async function purgeDocumentLocallyById(documentId: string): Promise<void> {
  const doc = await db.documents.get(documentId);
  const nowIso = new Date().toISOString();

  if (doc?.interventionId) {
    const it = await db.interventions.get(doc.interventionId);
    if (it) {
      const next = (it.documentIds ?? []).filter((x) => x !== documentId);
      await db.interventions.update(doc.interventionId, {
        documentIds: next.length ? next : undefined,
        updatedAt: nowIso
      });
    }
  } else {
    const all = await db.interventions.toArray();
    for (const it of all) {
      const ids = it.documentIds ?? [];
      if (!ids.includes(documentId)) continue;
      const next = ids.filter((x) => x !== documentId);
      await db.interventions.update(it.id, {
        documentIds: next.length ? next : undefined,
        updatedAt: nowIso
      });
    }
  }

  if (!doc) return;

  const aid = doc.attachmentId;
  await db.documents.delete(documentId);

  const others = await db.documents.filter((d) => d.attachmentId === aid).toArray();
  if (others.length === 0) {
    try {
      await db.attachments.delete(aid);
    } catch {
      /* ignore missing */
    }
  }
}

/**
 * Removes an attachment and all Dexie rows that reference it (documents, outbox, intervention photos/voice).
 */
export async function purgeAttachmentLocallyById(attachmentId: string): Promise<void> {
  const nowIso = new Date().toISOString();

  const docs = await db.documents.filter((d) => d.attachmentId === attachmentId).toArray();
  for (const d of docs) {
    if (d.interventionId) {
      const it = await db.interventions.get(d.interventionId);
      if (it) {
        const next = (it.documentIds ?? []).filter((x) => x !== d.id);
        await db.interventions.update(d.interventionId, {
          documentIds: next.length ? next : undefined,
          updatedAt: nowIso
        });
      }
    }
    await db.documents.delete(d.id);
  }

  const ivs = await db.interventions.toArray();
  for (const it of ivs) {
    const prevP = it.photoIds ?? [];
    const prevV = it.voiceNoteIds ?? [];
    const photos = prevP.filter((x) => x !== attachmentId);
    const voices = prevV.filter((x) => x !== attachmentId);
    if (photos.length === prevP.length && voices.length === prevV.length) continue;
    await db.interventions.update(it.id, {
      photoIds: photos.length ? photos : undefined,
      voiceNoteIds: voices.length ? voices : undefined,
      updatedAt: nowIso
    });
  }

  const outRows = await db.supportEmailOutbox
    .filter((o) => o.attachmentId === attachmentId)
    .toArray();
  for (const row of outRows) {
    await db.supportEmailOutbox.delete(row.id);
  }

  try {
    await db.attachments.delete(attachmentId);
  } catch {
    /* ignore missing */
  }
}
