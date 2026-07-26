import { db, type CompanyProcedure, type GlobalProcedure, type Procedure } from "@/lib/db/workflow-db";
import { createProcedure, type ProcedureFormValues } from "@/lib/procedures/procedure-mutations";
import { sanitizeProcedureHtml } from "@/lib/procedures/sanitize-html";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { performStandaloneAttachmentCloudDelete } from "@/lib/sync/cloud-delete";

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
 * Throws with code "PROCEDURE_ALREADY_CLONED" if this preset was already copied.
 * Images are copied as new attachment rows so sync and deletes stay isolated.
 */
export async function cloneGlobalProcedureToPersonal(
  global: GlobalProcedure
): Promise<string> {
  const existing = await db.procedures.where("sourceGlobalId").equals(global.id).first();
  if (existing) {
    const err = new Error("PROCEDURE_ALREADY_CLONED");
    err.name = "ProcedureAlreadyClonedError";
    throw err;
  }

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
    imageIds,
    sourceGlobalId: global.id,
    sectorTags: global.sectorTags
  };

  return createProcedure(values);
}

export type CloneAllGlobalResult = {
  added: number;
  skipped: number;
  failed: number;
};

/**
 * Clone every approved global preset not yet in the user's personal library.
 * Best-effort per row — one failure doesn't stop the rest.
 */
export async function cloneAllGlobalProceduresToPersonal(
  globals: readonly GlobalProcedure[]
): Promise<CloneAllGlobalResult> {
  const already = new Set(
    (await db.procedures.where("sourceGlobalId").anyOf(globals.map((g) => g.id)).toArray()).map(
      (p) => p.sourceGlobalId
    )
  );

  let added = 0;
  let skipped = 0;
  let failed = 0;
  for (const g of globals) {
    if ((g.status ?? "approved") !== "approved") {
      skipped++;
      continue;
    }
    if (already.has(g.id)) {
      skipped++;
      continue;
    }
    try {
      await cloneGlobalProcedureToPersonal(g);
      added++;
    } catch (e) {
      if (e instanceof Error && e.name === "ProcedureAlreadyClonedError") {
        skipped++;
      } else {
        failed++;
      }
    }
  }
  return { added, skipped, failed };
}

/**
 * Overwrite an existing personal procedure with a global preset's content
 * (chosen by the user when the two were flagged as the same procedure with
 * differing content). Old images are swapped for fresh copies of the
 * global's own images and best-effort deleted from cloud storage.
 */
export async function replacePersonalProcedureWithGlobal(
  existing: Procedure,
  global: GlobalProcedure
): Promise<void> {
  const imageIds: string[] = [];
  for (const srcId of global.imageIds ?? []) {
    const newId = await cloneAttachmentBlob(srcId);
    if (newId) imageIds.push(newId);
  }

  const nowIso = new Date().toISOString();
  await db.procedures.update(existing.id, {
    title: global.title.trim(),
    category: global.category,
    brand: global.brand,
    model: global.model,
    content: sanitizeProcedureHtml(global.content ?? ""),
    tags: global.tags?.length ? global.tags : undefined,
    imageIds: imageIds.length ? imageIds : undefined,
    sectorTags: global.sectorTags,
    sourceGlobalId: global.id,
    updatedAt: nowIso
  });

  const oldImageIds = existing.imageIds ?? [];
  if (oldImageIds.length) {
    const supabase = createSupabaseBrowserClient();
    for (const id of oldImageIds) {
      try {
        await performStandaloneAttachmentCloudDelete({ attachmentId: id, supabase, userId: null });
      } catch {
        /* best-effort */
      }
    }
  }
}

/**
 * Copy a teammate's company-shared procedure into the current user's own
 * personal library (a plain, independent copy — not linked back, since
 * company-shared rows stay owned and editable only by their original author).
 */
export async function cloneCompanyProcedureToPersonal(source: CompanyProcedure): Promise<string> {
  const imageIds: string[] = [];
  for (const srcId of source.imageIds ?? []) {
    const newId = await cloneAttachmentBlob(srcId);
    if (newId) imageIds.push(newId);
  }

  const values: ProcedureFormValues = {
    title: source.title.trim(),
    category: source.category,
    brand: source.brand,
    model: source.model,
    content: sanitizeProcedureHtml(source.content ?? ""),
    tags: source.tags ?? [],
    imageIds,
    sectorTags: source.sectorTags
  };

  return createProcedure(values);
}
