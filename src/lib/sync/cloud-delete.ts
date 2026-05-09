import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteInterventionWithRelations } from "@/lib/interventions/delete-intervention";
import { db } from "@/lib/db/workflow-db";
import { STORAGE_BUCKET } from "@/lib/sync/sync-constants";
import { pushSyncFailure } from "@/lib/sync/sync-failure-queue";
import { syncAuditLog } from "@/lib/sync/sync-audit";

const PENDING_INTERVENTION_DELETES_KEY = "workflow:pendingInterventionDeletes:v1";

export type InterventionDeleteSnapshot = {
  interventionId: string;
  documentIds: string[];
  attachmentIds: string[];
  outboxIds: string[];
  stockMovementIds: string[];
};

function assertUserStoragePath(path: string, userId: string): void {
  if (!path || !path.startsWith(`${userId}/`)) {
    throw new Error("Invalid storage path for user");
  }
}

export async function buildInterventionDeleteSnapshot(
  interventionId: string
): Promise<InterventionDeleteSnapshot> {
  const iv = await db.interventions.get(interventionId);
  if (!iv) throw new Error("Intervention not found");

  const attachmentIds = new Set<string>();
  for (const id of iv.photoIds ?? []) {
    if (id) attachmentIds.add(id);
  }
  for (const id of iv.voiceNoteIds ?? []) {
    if (id) attachmentIds.add(id);
  }

  const documentIds: string[] = [];
  for (const docId of iv.documentIds ?? []) {
    const doc = await db.documents.get(docId);
    if (doc?.attachmentId) attachmentIds.add(doc.attachmentId);
    documentIds.push(docId);
  }

  const outboxRows = await db.supportEmailOutbox
    .where("interventionId")
    .equals(interventionId)
    .toArray();
  const outboxIds = outboxRows.map((r) => r.id);
  for (const row of outboxRows) {
    if (row.attachmentId) attachmentIds.add(row.attachmentId);
  }

  const stockRows = await db.stockMovements
    .where("interventionId")
    .equals(interventionId)
    .toArray();

  return {
    interventionId,
    documentIds,
    attachmentIds: [...attachmentIds],
    outboxIds,
    stockMovementIds: stockRows.map((r) => r.id)
  };
}

function loadPendingInterventionDeletes(): InterventionDeleteSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_INTERVENTION_DELETES_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as InterventionDeleteSnapshot[]) : [];
  } catch {
    return [];
  }
}

function savePendingInterventionDeletes(items: InterventionDeleteSnapshot[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    PENDING_INTERVENTION_DELETES_KEY,
    JSON.stringify(items.slice(0, 50))
  );
}

export function enqueuePendingInterventionDelete(
  snap: InterventionDeleteSnapshot
): void {
  const cur = loadPendingInterventionDeletes().filter(
    (x) => x.interventionId !== snap.interventionId
  );
  savePendingInterventionDeletes([snap, ...cur]);
  syncAuditLog("pending_intervention_delete_enqueued", {
    interventionId: snap.interventionId
  });
}

function dequeuePendingInterventionDelete(interventionId: string): void {
  const cur = loadPendingInterventionDeletes().filter(
    (x) => x.interventionId !== interventionId
  );
  savePendingInterventionDeletes(cur);
}

export async function flushPendingInterventionDeletes(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const items = loadPendingInterventionDeletes();
  if (!items.length) return;
  const remaining: InterventionDeleteSnapshot[] = [];
  for (const snap of items) {
    try {
      await deleteInterventionRemote(supabase, userId, snap);
      syncAuditLog("pending_intervention_delete_flushed", {
        interventionId: snap.interventionId
      });
    } catch {
      remaining.push(snap);
    }
  }
  savePendingInterventionDeletes(remaining);
}

export async function deleteInterventionRemote(
  supabase: SupabaseClient,
  userId: string,
  snap: InterventionDeleteSnapshot
): Promise<void> {
  const { interventionId, documentIds, attachmentIds, outboxIds, stockMovementIds } =
    snap;

  if (outboxIds.length) {
    const { error } = await supabase
      .from("wf_support_email_outbox")
      .delete()
      .eq("user_id", userId)
      .in("id", outboxIds);
    if (error) throw new Error(error.message);
  }

  if (documentIds.length) {
    const { error } = await supabase
      .from("wf_documents")
      .delete()
      .eq("user_id", userId)
      .in("id", documentIds);
    if (error) throw new Error(error.message);
  }

  if (attachmentIds.length) {
    const { data: rows, error: selErr } = await supabase
      .from("wf_attachments")
      .select("id, storage_path")
      .eq("user_id", userId)
      .in("id", attachmentIds);
    if (selErr) throw new Error(selErr.message);
    const paths = (rows ?? [])
      .map((r) => String((r as { storage_path?: string }).storage_path ?? ""))
      .filter(Boolean);
    for (const p of paths) {
      assertUserStoragePath(p, userId);
    }
    if (paths.length) {
      const { error: rmErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(paths);
      if (rmErr) throw new Error(rmErr.message);
    }
    const { error } = await supabase
      .from("wf_attachments")
      .delete()
      .eq("user_id", userId)
      .in("id", attachmentIds);
    if (error) throw new Error(error.message);
  }

  if (stockMovementIds.length) {
    const { error } = await supabase
      .from("wf_stock_movements")
      .delete()
      .eq("user_id", userId)
      .in("id", stockMovementIds);
    if (error) throw new Error(error.message);
  }

  const { error: tErr } = await supabase
    .from("wf_tickets")
    .update({
      intervention_id: null,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId)
    .eq("intervention_id", interventionId);
  if (tErr) throw new Error(tErr.message);

  const { error: ivErr } = await supabase
    .from("wf_interventions")
    .delete()
    .eq("user_id", userId)
    .eq("id", interventionId);
  if (ivErr) throw new Error(ivErr.message);

  syncAuditLog("intervention_deleted_remote", { interventionId });
}

/**
 * When online: delete on Supabase first, then local Dexie.
 * When offline: queue remote delete for next sync, then delete locally.
 */
export async function performInterventionCloudSyncDelete(params: {
  interventionId: string;
  supabase: SupabaseClient | null;
  userId: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const snap = await buildInterventionDeleteSnapshot(params.interventionId);
  const online =
    typeof navigator !== "undefined" && navigator.onLine === true;

  if (online && params.supabase && params.userId) {
    try {
      await deleteInterventionRemote(params.supabase, params.userId, snap);
      await deleteInterventionWithRelations(params.interventionId);
      dequeuePendingInterventionDelete(params.interventionId);
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      pushSyncFailure({
        kind: "delete",
        title: "Intervention cloud delete failed",
        detail: message
      });
      return { ok: false, message };
    }
  }

  enqueuePendingInterventionDelete(snap);
  await deleteInterventionWithRelations(params.interventionId);
  return { ok: true };
}

export async function deleteTemplateRemote(
  supabase: SupabaseClient,
  userId: string,
  templateId: string
): Promise<void> {
  const { error } = await supabase
    .from("wf_templates")
    .delete()
    .eq("user_id", userId)
    .eq("id", templateId);
  if (error) throw new Error(error.message);
  syncAuditLog("template_deleted_remote", { templateId });
}

/** Remove document + attachment rows and file from Supabase (FK-safe order). */
export async function deleteDocumentRemote(
  supabase: SupabaseClient,
  userId: string,
  params: {
    documentId: string;
    attachmentId: string;
    interventionId?: string | null;
  }
): Promise<void> {
  const { documentId, attachmentId, interventionId } = params;

  const { error: obErr } = await supabase
    .from("wf_support_email_outbox")
    .delete()
    .eq("user_id", userId)
    .eq("document_id", documentId);
  if (obErr) throw new Error(obErr.message);

  if (interventionId) {
    const { data: iv, error: ivSelErr } = await supabase
      .from("wf_interventions")
      .select("document_ids")
      .eq("user_id", userId)
      .eq("id", interventionId)
      .maybeSingle();
    if (ivSelErr) throw new Error(ivSelErr.message);
    const prev = (iv?.document_ids as string[] | null) ?? [];
    const next = prev.filter((x) => x !== documentId);
    const { error: ivUp } = await supabase
      .from("wf_interventions")
      .update({
        document_ids: next,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId)
      .eq("id", interventionId);
    if (ivUp) throw new Error(ivUp.message);
  }

  const { error: docErr } = await supabase
    .from("wf_documents")
    .delete()
    .eq("user_id", userId)
    .eq("id", documentId);
  if (docErr) throw new Error(docErr.message);

  const { data: att, error: attSelErr } = await supabase
    .from("wf_attachments")
    .select("storage_path")
    .eq("user_id", userId)
    .eq("id", attachmentId)
    .maybeSingle();
  if (attSelErr) throw new Error(attSelErr.message);
  const path = att?.storage_path ? String(att.storage_path) : "";
  if (path) {
    assertUserStoragePath(path, userId);
    const { error: stErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([path]);
    if (stErr) throw new Error(stErr.message);
  }

  const { error: attDel } = await supabase
    .from("wf_attachments")
    .delete()
    .eq("user_id", userId)
    .eq("id", attachmentId);
  if (attDel) throw new Error(attDel.message);

  syncAuditLog("document_deleted_remote", { documentId });
}

export async function deleteVoiceAttachmentRemote(
  supabase: SupabaseClient,
  userId: string,
  params: { attachmentId: string; interventionId: string }
): Promise<void> {
  const { attachmentId, interventionId } = params;

  const { data: iv, error: ivSelErr } = await supabase
    .from("wf_interventions")
    .select("voice_note_ids")
    .eq("user_id", userId)
    .eq("id", interventionId)
    .maybeSingle();
  if (ivSelErr) throw new Error(ivSelErr.message);
  const prev = (iv?.voice_note_ids as string[] | null) ?? [];
  const next = prev.filter((x) => x !== attachmentId);
  const { error: ivUp } = await supabase
    .from("wf_interventions")
    .update({
      voice_note_ids: next,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId)
    .eq("id", interventionId);
  if (ivUp) throw new Error(ivUp.message);

  const { data: att, error: attSelErr } = await supabase
    .from("wf_attachments")
    .select("storage_path")
    .eq("user_id", userId)
    .eq("id", attachmentId)
    .maybeSingle();
  if (attSelErr) throw new Error(attSelErr.message);
  const path = att?.storage_path ? String(att.storage_path) : "";
  if (path) {
    assertUserStoragePath(path, userId);
    const { error: stErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([path]);
    if (stErr) throw new Error(stErr.message);
  }

  const { error: attDel } = await supabase
    .from("wf_attachments")
    .delete()
    .eq("user_id", userId)
    .eq("id", attachmentId);
  if (attDel) throw new Error(attDel.message);

  syncAuditLog("voice_attachment_deleted_remote", { attachmentId });
}
