import { db, type GlobalProcedure } from "@/lib/db/workflow-db";
import { createProcedure, type ProcedureFormValues } from "@/lib/procedures/procedure-mutations";
import { sanitizeProcedureHtml } from "@/lib/procedures/sanitize-html";

/** Duplicate one attachment blob under a new id (owned by the current user on sync). */
export async function cloneAttachmentBlob(sourceId: string): Promise<string | null> {
  const src = await db.attachments.get(sourceId);
  if (!src?.blob) return null;
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  await db.attachments.add({
    id,
    kind: src.kind,
    mime: src.mime,
    name: src.name,
    size: src.size,
    blob: src.blob,
    createdAt: nowIso,
    updatedAt: nowIso
  });
  return id;
}

/**
 * Clone a global preset into the current user's personal procedures table.
 * Images are copied as new attachment rows so sync and deletes stay isolated.
 */
export async function cloneGlobalProcedureToPersonal(
  global: GlobalProcedure
): Promise<string> {
  const imageIds: string[] = [];
  for (const srcId of global.imageIds ?? []) {
    const newId = await cloneAttachmentBlob(srcId);
    if (newId) imageIds.push(newId);
  }

  const values: ProcedureFormValues = {
    title: global.title.trim(),
    category: global.category,
    brand: global.brand,
    model: global.model,
    content: sanitizeProcedureHtml(global.content ?? ""),
    tags: global.tags ?? [],
    imageIds
  };

  return createProcedure(values);
}
