import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteInterventionWithRelations
} from "@/lib/interventions/delete-intervention";
import { purgeClientLocallyById } from "@/lib/clients/purge-client-locally";
import {
  purgeActivityLocallyById,
  purgeAttachmentLocallyById,
  purgeDocumentLocallyById,
  purgeTemplateLocallyById
} from "@/lib/sync/purge-entities-locally";
import { db } from "@/lib/db/workflow-db";
import {
  STORAGE_BUCKET,
  legacyAttachmentStoragePath
} from "@/lib/sync/sync-constants";
import { pushSyncFailure } from "@/lib/sync/sync-failure-queue";
import { syncAuditLog } from "@/lib/sync/sync-audit";

const PENDING_INTERVENTION_DELETES_KEY = "workflow:pendingInterventionDeletes:v1";
const PENDING_CLIENT_DELETES_KEY = "workflow:pendingClientDeletes:v1";

export type InterventionDeleteSnapshot = {
  interventionId: string;
  documentIds: string[];
  attachmentIds: string[];
  outboxIds: string[];
  stockMovementIds: string[];
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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
  try {
    localStorage.setItem(
      PENDING_INTERVENTION_DELETES_KEY,
      JSON.stringify(items.slice(0, 50))
    );
  } catch (e) {
    syncAuditLog("pending_intervention_delete_save_failed", {
      message: e instanceof Error ? e.message : String(e)
    });
    throw e;
  }
}

/** Used by pull paths to avoid resurrecting rows that are queued for cloud deletion. */
export function getPendingInterventionPullSkipContext(): {
  interventionIds: Set<string>;
  documentIds: Set<string>;
  attachmentIds: Set<string>;
  outboxIds: Set<string>;
  stockMovementIds: Set<string>;
} {
  const items = loadPendingInterventionDeletes();
  const interventionIds = new Set(items.map((i) => i.interventionId));
  const documentIds = new Set(items.flatMap((i) => i.documentIds));
  const attachmentIds = new Set(items.flatMap((i) => i.attachmentIds));
  const outboxIds = new Set(items.flatMap((i) => i.outboxIds));
  const stockMovementIds = new Set(items.flatMap((i) => i.stockMovementIds));
  return {
    interventionIds,
    documentIds,
    attachmentIds,
    outboxIds,
    stockMovementIds
  };
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

export function dequeuePendingInterventionDelete(interventionId: string): void {
  const cur = loadPendingInterventionDeletes().filter(
    (x) => x.interventionId !== interventionId
  );
  savePendingInterventionDeletes(cur);
}

// —— Pending client deletes (mirror intervention cloud-delete queue) ——————

function loadPendingClientDeletes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_CLIENT_DELETES_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as string[]).filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function savePendingClientDeletes(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PENDING_CLIENT_DELETES_KEY, JSON.stringify(ids.slice(0, 80)));
  } catch (e) {
    syncAuditLog("pending_client_delete_save_failed", {
      message: e instanceof Error ? e.message : String(e)
    });
    throw e;
  }
}

export function enqueuePendingClientDelete(clientId: string): void {
  const cur = loadPendingClientDeletes().filter((x) => x !== clientId);
  savePendingClientDeletes([clientId, ...cur]);
  syncAuditLog("pending_client_delete_enqueued", { clientId });
}

export function dequeuePendingClientDelete(clientId: string): void {
  const cur = loadPendingClientDeletes().filter((x) => x !== clientId);
  savePendingClientDeletes(cur);
}

/** Skip pull upserts for clients we are still trying to delete from the cloud. */
export function getPendingClientPullSkipContext(): { clientIds: Set<string> } {
  return { clientIds: new Set(loadPendingClientDeletes()) };
}

export async function flushPendingClientDeletes(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const ids = loadPendingClientDeletes();
  if (!ids.length) return;
  const remaining: string[] = [];
  for (const clientId of ids) {
    try {
      await deleteClientRemote(supabase, userId, clientId);
      dequeuePendingClientDelete(clientId);
      await purgeClientLocallyById(clientId);
      syncAuditLog("pending_client_delete_flushed", { clientId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      syncAuditLog("pending_client_delete_flush_failed", { clientId, message: msg });
      remaining.push(clientId);
    }
  }
  savePendingClientDeletes(remaining);
}

export type ClientCloudDeleteResult =
  | { ok: true; mode: "cloud" | "queued" }
  | { ok: false; message: string };

/**
 * Enqueue cloud delete first, then:
 * - Online: delete on Supabase, purge locally, dequeue on success.
 * - Offline: purge locally; queue is flushed on next sync (like interventions).
 */
export async function performClientCloudSyncDelete(params: {
  clientId: string;
  supabase: SupabaseClient | null;
  userId: string | null;
}): Promise<ClientCloudDeleteResult> {
  enqueuePendingClientDelete(params.clientId);

  const client = params.supabase;
  let resolvedUserId = params.userId;
  if (client && !resolvedUserId) {
    const { data } = await client.auth.getSession();
    resolvedUserId = data.session?.user?.id ?? null;
  }

  const online = typeof navigator !== "undefined" && navigator.onLine === true;
  const canRemote = Boolean(online && client && resolvedUserId);

  if (canRemote) {
    try {
      await deleteClientRemote(client!, resolvedUserId!, params.clientId);
      await purgeClientLocallyById(params.clientId);
      dequeuePendingClientDelete(params.clientId);
      syncAuditLog("client_delete_complete_cloud", { clientId: params.clientId });
      return { ok: true, mode: "cloud" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      pushSyncFailure({
        kind: "delete",
        title: "Client cloud delete failed",
        detail: message
      });
      syncAuditLog("client_delete_remote_failed_keep_queue", {
        clientId: params.clientId,
        message
      });
      return { ok: false, message };
    }
  }

  await purgeClientLocallyById(params.clientId);
  syncAuditLog("client_delete_local_queued_cloud", { clientId: params.clientId });
  return { ok: true, mode: "queued" };
}

// —— Pending deletes: documents / templates / voice attachments ———————————

const PENDING_DOCUMENT_DELETES_KEY = "workflow:pendingDocumentDeletes:v1";
const PENDING_TEMPLATE_DELETES_KEY = "workflow:pendingTemplateDeletes:v1";
const PENDING_ATTACHMENT_DELETES_KEY = "workflow:pendingAttachmentDeletes:v1";
const PENDING_ACTIVITY_DELETES_KEY = "workflow:pendingActivityDeletes:v1";

export type PendingDocumentDeleteSnapshot = {
  documentId: string;
  attachmentId: string;
  interventionId?: string | null;
};

export type PendingVoiceAttachmentDeleteSnapshot = {
  attachmentId: string;
  interventionId: string;
};

function loadPendingDocumentDeletes(): PendingDocumentDeleteSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_DOCUMENT_DELETES_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as PendingDocumentDeleteSnapshot[]) : [];
  } catch {
    return [];
  }
}

function savePendingDocumentDeletes(items: PendingDocumentDeleteSnapshot[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_DOCUMENT_DELETES_KEY, JSON.stringify(items.slice(0, 40)));
}

export function enqueuePendingDocumentDelete(snap: PendingDocumentDeleteSnapshot): void {
  const cur = loadPendingDocumentDeletes().filter((x) => x.documentId !== snap.documentId);
  savePendingDocumentDeletes([snap, ...cur]);
}

export function dequeuePendingDocumentDelete(documentId: string): void {
  savePendingDocumentDeletes(loadPendingDocumentDeletes().filter((x) => x.documentId !== documentId));
}

function loadPendingTemplateDeletes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_TEMPLATE_DELETES_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as string[]).filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function savePendingTemplateDeletes(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_TEMPLATE_DELETES_KEY, JSON.stringify(ids.slice(0, 60)));
}

export function enqueuePendingTemplateDelete(templateId: string): void {
  const cur = loadPendingTemplateDeletes().filter((x) => x !== templateId);
  savePendingTemplateDeletes([templateId, ...cur]);
}

export function dequeuePendingTemplateDelete(templateId: string): void {
  savePendingTemplateDeletes(loadPendingTemplateDeletes().filter((x) => x !== templateId));
}

function loadPendingAttachmentDeletes(): PendingVoiceAttachmentDeleteSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_ATTACHMENT_DELETES_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as PendingVoiceAttachmentDeleteSnapshot[]) : [];
  } catch {
    return [];
  }
}

function savePendingAttachmentDeletes(items: PendingVoiceAttachmentDeleteSnapshot[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_ATTACHMENT_DELETES_KEY, JSON.stringify(items.slice(0, 40)));
}

export function enqueuePendingAttachmentDelete(snap: PendingVoiceAttachmentDeleteSnapshot): void {
  const cur = loadPendingAttachmentDeletes().filter((x) => x.attachmentId !== snap.attachmentId);
  savePendingAttachmentDeletes([snap, ...cur]);
}

export function dequeuePendingAttachmentDelete(attachmentId: string): void {
  savePendingAttachmentDeletes(
    loadPendingAttachmentDeletes().filter((x) => x.attachmentId !== attachmentId)
  );
}

// —— Pending deletes: activities (offline-first, mirrors templates) ——————

function loadPendingActivityDeletes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_ACTIVITY_DELETES_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as string[]).filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function savePendingActivityDeletes(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_ACTIVITY_DELETES_KEY, JSON.stringify(ids.slice(0, 80)));
}

export function enqueuePendingActivityDelete(activityId: string): void {
  const cur = loadPendingActivityDeletes().filter((x) => x !== activityId);
  savePendingActivityDeletes([activityId, ...cur]);
}

export function dequeuePendingActivityDelete(activityId: string): void {
  savePendingActivityDeletes(loadPendingActivityDeletes().filter((x) => x !== activityId));
}

/** Skip pull/realtime upserts for activities still queued for cloud deletion. */
export function getPendingActivityPullSkipContext(): { activityIds: Set<string> } {
  return { activityIds: new Set(loadPendingActivityDeletes()) };
}

export async function deleteActivityRemote(
  supabase: SupabaseClient,
  userId: string,
  activityId: string
): Promise<void> {
  const { error } = await supabase
    .from("wf_activities")
    .delete()
    .eq("user_id", userId)
    .eq("id", activityId);
  if (error) throw new Error(error.message);
  syncAuditLog("activity_deleted_remote", { activityId });
}

export async function flushPendingActivityDeletes(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const ids = loadPendingActivityDeletes();
  if (!ids.length) return;
  const remaining: string[] = [];
  for (const activityId of ids) {
    try {
      await deleteActivityRemote(supabase, userId, activityId);
      dequeuePendingActivityDelete(activityId);
      await purgeActivityLocallyById(activityId);
      syncAuditLog("pending_activity_delete_flushed", { activityId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      syncAuditLog("pending_activity_delete_flush_failed", { activityId, message: msg });
      remaining.push(activityId);
    }
  }
  savePendingActivityDeletes(remaining);
}

export async function performActivityCloudSyncDelete(params: {
  activityId: string;
  supabase: SupabaseClient | null;
  userId: string | null;
}): Promise<EntityCloudDeleteResult> {
  enqueuePendingActivityDelete(params.activityId);
  const client = params.supabase;
  let resolvedUserId = params.userId;
  if (client && !resolvedUserId) {
    const { data } = await client.auth.getSession();
    resolvedUserId = data.session?.user?.id ?? null;
  }
  const online = typeof navigator !== "undefined" && navigator.onLine === true;
  const canRemote = Boolean(online && client && resolvedUserId);
  if (canRemote) {
    try {
      await deleteActivityRemote(client!, resolvedUserId!, params.activityId);
      await purgeActivityLocallyById(params.activityId);
      dequeuePendingActivityDelete(params.activityId);
      return { ok: true, mode: "cloud" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      pushSyncFailure({ kind: "delete", title: "Activity cloud delete failed", detail: message });
      return { ok: false, message };
    }
  }
  await purgeActivityLocallyById(params.activityId);
  return { ok: true, mode: "queued" };
}

/**
 * Merged pull-skip context: intervention pending deletes + document/template/voice
 * pending queues so pull does not resurrect rows we are still deleting from the cloud.
 */
export function getPendingSyncPullSkipContext(): {
  interventionIds: Set<string>;
  documentIds: Set<string>;
  attachmentIds: Set<string>;
  outboxIds: Set<string>;
  stockMovementIds: Set<string>;
  templateIds: Set<string>;
} {
  const iv = getPendingInterventionPullSkipContext();
  const documentIds = new Set(iv.documentIds);
  for (const s of loadPendingDocumentDeletes()) {
    documentIds.add(s.documentId);
  }
  const attachmentIds = new Set(iv.attachmentIds);
  for (const s of loadPendingAttachmentDeletes()) {
    attachmentIds.add(s.attachmentId);
  }
  const templateIds = new Set(loadPendingTemplateDeletes());
  return {
    interventionIds: iv.interventionIds,
    documentIds,
    attachmentIds,
    outboxIds: iv.outboxIds,
    stockMovementIds: iv.stockMovementIds,
    templateIds
  };
}

export async function flushPendingDocumentDeletes(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const items = loadPendingDocumentDeletes();
  if (!items.length) return;
  const remaining: PendingDocumentDeleteSnapshot[] = [];
  for (const snap of items) {
    try {
      await deleteDocumentRemote(supabase, userId, {
        documentId: snap.documentId,
        attachmentId: snap.attachmentId,
        interventionId: snap.interventionId ?? null
      });
      dequeuePendingDocumentDelete(snap.documentId);
      await purgeDocumentLocallyById(snap.documentId);
      syncAuditLog("pending_document_delete_flushed", { documentId: snap.documentId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      syncAuditLog("pending_document_delete_flush_failed", {
        documentId: snap.documentId,
        message: msg
      });
      remaining.push(snap);
    }
  }
  savePendingDocumentDeletes(remaining);
}

export async function flushPendingTemplateDeletes(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const ids = loadPendingTemplateDeletes();
  if (!ids.length) return;
  const remaining: string[] = [];
  for (const templateId of ids) {
    try {
      await deleteTemplateRemote(supabase, userId, templateId);
      dequeuePendingTemplateDelete(templateId);
      await purgeTemplateLocallyById(templateId);
      syncAuditLog("pending_template_delete_flushed", { templateId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      syncAuditLog("pending_template_delete_flush_failed", { templateId, message: msg });
      remaining.push(templateId);
    }
  }
  savePendingTemplateDeletes(remaining);
}

export async function flushPendingAttachmentDeletes(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const items = loadPendingAttachmentDeletes();
  if (!items.length) return;
  const remaining: PendingVoiceAttachmentDeleteSnapshot[] = [];
  for (const snap of items) {
    try {
      await deleteVoiceAttachmentRemote(supabase, userId, {
        attachmentId: snap.attachmentId,
        interventionId: snap.interventionId
      });
      dequeuePendingAttachmentDelete(snap.attachmentId);
      await purgeAttachmentLocallyById(snap.attachmentId);
      syncAuditLog("pending_attachment_delete_flushed", { attachmentId: snap.attachmentId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      syncAuditLog("pending_attachment_delete_flush_failed", {
        attachmentId: snap.attachmentId,
        message: msg
      });
      remaining.push(snap);
    }
  }
  savePendingAttachmentDeletes(remaining);
}

export type EntityCloudDeleteResult =
  | { ok: true; mode: "cloud" | "queued" }
  | { ok: false; message: string };

export async function performDocumentCloudSyncDelete(params: {
  snap: PendingDocumentDeleteSnapshot;
  supabase: SupabaseClient | null;
  userId: string | null;
}): Promise<EntityCloudDeleteResult> {
  enqueuePendingDocumentDelete(params.snap);
  const client = params.supabase;
  let resolvedUserId = params.userId;
  if (client && !resolvedUserId) {
    const { data } = await client.auth.getSession();
    resolvedUserId = data.session?.user?.id ?? null;
  }
  const online = typeof navigator !== "undefined" && navigator.onLine === true;
  const canRemote = Boolean(online && client && resolvedUserId);
  if (canRemote) {
    try {
      await deleteDocumentRemote(client!, resolvedUserId!, {
        documentId: params.snap.documentId,
        attachmentId: params.snap.attachmentId,
        interventionId: params.snap.interventionId ?? null
      });
      await purgeDocumentLocallyById(params.snap.documentId);
      dequeuePendingDocumentDelete(params.snap.documentId);
      return { ok: true, mode: "cloud" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      pushSyncFailure({ kind: "delete", title: "Document cloud delete failed", detail: message });
      return { ok: false, message };
    }
  }
  await purgeDocumentLocallyById(params.snap.documentId);
  return { ok: true, mode: "queued" };
}

export async function performTemplateCloudSyncDelete(params: {
  templateId: string;
  supabase: SupabaseClient | null;
  userId: string | null;
}): Promise<EntityCloudDeleteResult> {
  enqueuePendingTemplateDelete(params.templateId);
  const client = params.supabase;
  let resolvedUserId = params.userId;
  if (client && !resolvedUserId) {
    const { data } = await client.auth.getSession();
    resolvedUserId = data.session?.user?.id ?? null;
  }
  const online = typeof navigator !== "undefined" && navigator.onLine === true;
  const canRemote = Boolean(online && client && resolvedUserId);
  if (canRemote) {
    try {
      await deleteTemplateRemote(client!, resolvedUserId!, params.templateId);
      await purgeTemplateLocallyById(params.templateId);
      dequeuePendingTemplateDelete(params.templateId);
      return { ok: true, mode: "cloud" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      pushSyncFailure({ kind: "delete", title: "Template cloud delete failed", detail: message });
      return { ok: false, message };
    }
  }
  await purgeTemplateLocallyById(params.templateId);
  return { ok: true, mode: "queued" };
}

export async function performVoiceAttachmentCloudSyncDelete(params: {
  snap: PendingVoiceAttachmentDeleteSnapshot;
  supabase: SupabaseClient | null;
  userId: string | null;
}): Promise<EntityCloudDeleteResult> {
  enqueuePendingAttachmentDelete(params.snap);
  const client = params.supabase;
  let resolvedUserId = params.userId;
  if (client && !resolvedUserId) {
    const { data } = await client.auth.getSession();
    resolvedUserId = data.session?.user?.id ?? null;
  }
  const online = typeof navigator !== "undefined" && navigator.onLine === true;
  const canRemote = Boolean(online && client && resolvedUserId);
  if (canRemote) {
    try {
      await deleteVoiceAttachmentRemote(client!, resolvedUserId!, {
        attachmentId: params.snap.attachmentId,
        interventionId: params.snap.interventionId
      });
      await purgeAttachmentLocallyById(params.snap.attachmentId);
      dequeuePendingAttachmentDelete(params.snap.attachmentId);
      return { ok: true, mode: "cloud" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      pushSyncFailure({
        kind: "delete",
        title: "Voice attachment cloud delete failed",
        detail: message
      });
      return { ok: false, message };
    }
  }
  await purgeAttachmentLocallyById(params.snap.attachmentId);
  return { ok: true, mode: "queued" };
}

export async function deleteSparePartRemote(
  supabase: SupabaseClient,
  userId: string,
  sparePartId: string
): Promise<void> {
  const { error } = await supabase
    .from("wf_spare_parts")
    .delete()
    .eq("user_id", userId)
    .eq("id", sparePartId);
  if (error) throw new Error(error.message);
  syncAuditLog("spare_part_deleted_remote", { sparePartId });
}

export async function deleteStockMovementRemote(
  supabase: SupabaseClient,
  userId: string,
  stockMovementId: string
): Promise<void> {
  const { error } = await supabase
    .from("wf_stock_movements")
    .delete()
    .eq("user_id", userId)
    .eq("id", stockMovementId);
  if (error) throw new Error(error.message);
  syncAuditLog("stock_movement_deleted_remote", { stockMovementId });
}

export async function deleteTicketRemote(
  supabase: SupabaseClient,
  userId: string,
  ticketId: string
): Promise<void> {
  const { error } = await supabase
    .from("wf_tickets")
    .delete()
    .eq("user_id", userId)
    .eq("id", ticketId);
  if (error) throw new Error(error.message);
  syncAuditLog("ticket_deleted_remote", { ticketId });
}

export async function deleteOutboxRemote(
  supabase: SupabaseClient,
  userId: string,
  outboxId: string
): Promise<void> {
  const { error } = await supabase
    .from("wf_support_email_outbox")
    .delete()
    .eq("user_id", userId)
    .eq("id", outboxId);
  if (error) throw new Error(error.message);
  syncAuditLog("outbox_deleted_remote", { outboxId });
}

async function deleteByIdsInChunks(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  ids: string[],
  chunkSize = 40
): Promise<void> {
  const clean = [...new Set(ids.filter(Boolean))];
  for (const part of chunk(clean, chunkSize)) {
    if (!part.length) continue;
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("user_id", userId)
      .in("id", part);
    if (error) throw new Error(`${table} delete: ${error.message}`);
  }
}

/**
 * Merge local snapshot with whatever still exists on Supabase for this intervention
 * (photos/docs only on server, extra documents, outbox rows, stock lines, etc.).
 */
async function enrichInterventionDeleteSnapshotFromServer(
  supabase: SupabaseClient,
  userId: string,
  snap: InterventionDeleteSnapshot
): Promise<InterventionDeleteSnapshot> {
  const docIds = new Set(snap.documentIds);
  const attIds = new Set(snap.attachmentIds);
  const outIds = new Set(snap.outboxIds);
  const stockIds = new Set(snap.stockMovementIds);

  const { data: ivRow, error: ivErr } = await supabase
    .from("wf_interventions")
    .select("photo_ids, document_ids, voice_note_ids")
    .eq("user_id", userId)
    .eq("id", snap.interventionId)
    .maybeSingle();
  if (ivErr) throw new Error(ivErr.message);

  if (ivRow) {
    for (const id of (ivRow.photo_ids as string[] | null) ?? []) {
      if (id) attIds.add(id);
    }
    for (const id of (ivRow.voice_note_ids as string[] | null) ?? []) {
      if (id) attIds.add(id);
    }
    for (const id of (ivRow.document_ids as string[] | null) ?? []) {
      if (id) docIds.add(id);
    }
  }

  const { data: docByIv, error: dErr } = await supabase
    .from("wf_documents")
    .select("id, attachment_id")
    .eq("user_id", userId)
    .eq("intervention_id", snap.interventionId);
  if (dErr) throw new Error(dErr.message);
  for (const d of docByIv ?? []) {
    const row = d as { id?: string; attachment_id?: string };
    if (row.id) docIds.add(String(row.id));
    if (row.attachment_id) attIds.add(String(row.attachment_id));
  }

  const { data: obByIv, error: oErr } = await supabase
    .from("wf_support_email_outbox")
    .select("id, attachment_id")
    .eq("user_id", userId)
    .eq("intervention_id", snap.interventionId);
  if (oErr) throw new Error(oErr.message);
  for (const o of obByIv ?? []) {
    const row = o as { id?: string; attachment_id?: string };
    if (row.id) outIds.add(String(row.id));
    if (row.attachment_id) attIds.add(String(row.attachment_id));
  }

  const { data: smByIv, error: sErr } = await supabase
    .from("wf_stock_movements")
    .select("id")
    .eq("user_id", userId)
    .eq("intervention_id", snap.interventionId);
  if (sErr) throw new Error(sErr.message);
  for (const s of smByIv ?? []) {
    const id = (s as { id?: string }).id;
    if (id) stockIds.add(String(id));
  }

  return {
    interventionId: snap.interventionId,
    documentIds: [...docIds],
    attachmentIds: [...attIds],
    outboxIds: [...outIds],
    stockMovementIds: [...stockIds]
  };
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
      dequeuePendingInterventionDelete(snap.interventionId);
      syncAuditLog("pending_intervention_delete_flushed", {
        interventionId: snap.interventionId
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      syncAuditLog("pending_intervention_delete_flush_failed", {
        interventionId: snap.interventionId,
        message: msg
      });
      remaining.push(snap);
    }
  }
  savePendingInterventionDeletes(remaining);
}

export async function deleteInterventionRemote(
  supabase: SupabaseClient,
  userId: string,
  snapIn: InterventionDeleteSnapshot
): Promise<void> {
  const snap = await enrichInterventionDeleteSnapshotFromServer(
    supabase,
    userId,
    snapIn
  );
  const { interventionId } = snap;

  const { error: obScopeErr } = await supabase
    .from("wf_support_email_outbox")
    .delete()
    .eq("user_id", userId)
    .eq("intervention_id", interventionId);
  if (obScopeErr) throw new Error(obScopeErr.message);

  await deleteByIdsInChunks(
    supabase,
    "wf_support_email_outbox",
    userId,
    snap.outboxIds
  );

  const { error: docScopeErr } = await supabase
    .from("wf_documents")
    .delete()
    .eq("user_id", userId)
    .eq("intervention_id", interventionId);
  if (docScopeErr) throw new Error(docScopeErr.message);

  await deleteByIdsInChunks(supabase, "wf_documents", userId, snap.documentIds);

  const attList = [...new Set(snap.attachmentIds.filter(Boolean))];
  if (attList.length) {
    const pathsToRemove: string[] = [];
    for (const part of chunk(attList, 60)) {
      const { data: rows, error: selErr } = await supabase
        .from("wf_attachments")
        .select("id, storage_path")
        .eq("user_id", userId)
        .in("id", part);
      if (selErr) throw new Error(selErr.message);
      for (const r of rows ?? []) {
        const row = r as { id?: string; storage_path?: string };
        const p = row.storage_path ? String(row.storage_path) : "";
        if (p) {
          assertUserStoragePath(p, userId);
          pathsToRemove.push(p);
        }
      }
    }
    const uniquePaths = [...new Set(pathsToRemove)];
    for (const part of chunk(uniquePaths, 80)) {
      if (!part.length) continue;
      const { error: rmErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(part);
      if (rmErr) {
        syncAuditLog("intervention_delete_storage_partial", {
          interventionId,
          message: rmErr.message
        });
      }
    }
    for (const aid of attList) {
      const legacy = legacyAttachmentStoragePath(userId, aid);
      if (!uniquePaths.includes(legacy)) {
        await supabase.storage.from(STORAGE_BUCKET).remove([legacy]);
      }
    }
    await deleteByIdsInChunks(supabase, "wf_attachments", userId, attList);
  }

  const { error: smScopeErr } = await supabase
    .from("wf_stock_movements")
    .delete()
    .eq("user_id", userId)
    .eq("intervention_id", interventionId);
  if (smScopeErr) throw new Error(smScopeErr.message);

  await deleteByIdsInChunks(
    supabase,
    "wf_stock_movements",
    userId,
    snap.stockMovementIds
  );

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

export type InterventionCloudDeleteResult =
  | { ok: true; mode: "cloud" | "queued" }
  | { ok: false; message: string };

/**
 * Always persists a pending snapshot first, then:
 * - Online + Supabase session: delete remotely, then locally, then dequeue.
 * - Otherwise: delete locally only; queue is flushed on the next successful sync.
 */
export async function performInterventionCloudSyncDelete(params: {
  interventionId: string;
  supabase: SupabaseClient | null;
  userId: string | null;
}): Promise<InterventionCloudDeleteResult> {
  const snap = await buildInterventionDeleteSnapshot(params.interventionId);
  enqueuePendingInterventionDelete(snap);

  const client = params.supabase;
  let resolvedUserId = params.userId;
  if (client && !resolvedUserId) {
    const { data } = await client.auth.getSession();
    resolvedUserId = data.session?.user?.id ?? null;
  }

  const online =
    typeof navigator !== "undefined" && navigator.onLine === true;
  const canRemote = Boolean(online && client && resolvedUserId);

  if (canRemote) {
    try {
      await deleteInterventionRemote(client!, resolvedUserId!, snap);
      await deleteInterventionWithRelations(params.interventionId);
      dequeuePendingInterventionDelete(params.interventionId);
      syncAuditLog("intervention_delete_complete_cloud", {
        interventionId: params.interventionId
      });
      return { ok: true, mode: "cloud" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      pushSyncFailure({
        kind: "delete",
        title: "Intervention cloud delete failed",
        detail: message
      });
      syncAuditLog("intervention_delete_remote_failed_keep_queue", {
        interventionId: params.interventionId,
        message
      });
      return { ok: false, message };
    }
  }

  await deleteInterventionWithRelations(params.interventionId);
  syncAuditLog("intervention_delete_local_queued_cloud", {
    interventionId: params.interventionId
  });
  return { ok: true, mode: "queued" };
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

export async function deleteClientRemote(
  supabase: SupabaseClient,
  userId: string,
  clientId: string
): Promise<void> {
  const { error } = await supabase
    .from("wf_clients")
    .delete()
    .eq("user_id", userId)
    .eq("id", clientId);
  if (error) throw new Error(error.message);
  syncAuditLog("client_deleted_remote", { clientId });
}

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
