/**
 * WorkFlow cloud sync: Dexie ↔ Supabase + realtime hooks (Sections 1–3).
 * - Push / pull with merge: skip remote row only if local is newer **and** still dirty vs last sync.
 * - Attachments: Storage path `{userId}/{attachmentId}-{safeName}` with XHR upload + retries on push.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { purgeInterventionLocallyById } from "@/lib/interventions/delete-intervention";
import {
  flushPendingInterventionDeletes,
  getPendingInterventionPullSkipContext
} from "@/lib/sync/cloud-delete";
import { pushSyncFailure, useSyncFailureQueue } from "@/lib/sync/sync-failure-queue";
import { syncAuditLog } from "@/lib/sync/sync-audit";
import {
  STORAGE_BUCKET,
  buildAttachmentStoragePath,
  legacyAttachmentStoragePath
} from "@/lib/sync/sync-constants";
import { uploadToSupabaseStorageWithRetries } from "@/lib/sync/storage-upload";
import { useSyncUiStore } from "@/stores/sync-ui";
import {
  db,
  type Attachment,
  type Client,
  type Document,
  type Intervention,
  type InterventionTemplate,
  type SparePart,
  type StockMovement,
  type SupportEmailOutboxItem,
  type Ticket
} from "@/lib/db/workflow-db";

const PAGE_SIZE = 500;
const SYNC_DEBOUNCE_MS = 2000;
const SYNC_USER_KEY = "workflow.sync.lastUserId.v1";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

let autoSyncRetryTimer: number | null = null;
let autoSyncRetryAttempt = 0;

export function cancelAutomatedSyncRetry(): void {
  if (autoSyncRetryTimer) {
    clearTimeout(autoSyncRetryTimer);
    autoSyncRetryTimer = null;
  }
}

function scheduleAutomatedSyncRetry(): void {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) return;
  if (autoSyncRetryTimer) return;
  const exp = Math.max(0, autoSyncRetryAttempt - 1);
  const delay = Math.min(90_000, 2000 * 2 ** exp);
  autoSyncRetryTimer = window.setTimeout(() => {
    autoSyncRetryTimer = null;
    const c = syncSupabase;
    if (!c || autoSyncRetryAttempt > 8) return;
    void runFullSync(c);
  }, delay);
}

export type SyncResult = {
  ok: boolean;
  pushed: Record<string, number>;
  pulled: Record<string, number>;
  errors: string[];
  skipped: boolean;
  reason?: string;
};

function iso(v: unknown): string {
  if (v == null) return new Date(0).toISOString();
  if (typeof v === "string") return v;
  return String(v);
}

function parseMs(isoStr: string): number {
  const t = new Date(isoStr).getTime();
  return Number.isFinite(t) ? t : 0;
}

function isDirty(localUpdated: string, syncedAt?: string): boolean {
  if (!syncedAt) return true;
  return parseMs(localUpdated) > parseMs(syncedAt);
}

/** Skip applying a remote row when local is strictly newer and still has unsynced edits. */
function shouldSkipRemoteMerge(
  remoteUpdatedAt: string,
  local: { updatedAt?: string; createdAt?: string; syncedAt?: string } | undefined
): boolean {
  if (!local) return false;
  const localU = local.updatedAt ?? local.createdAt ?? "";
  return shouldSkipRemoteMergeTs(remoteUpdatedAt, localU, local.syncedAt);
}

function shouldSkipRemoteMergeTs(
  remoteUpdatedAt: string,
  localUpdated: string,
  syncedAt?: string
): boolean {
  return parseMs(localUpdated) > parseMs(remoteUpdatedAt) && isDirty(localUpdated, syncedAt);
}

function effectiveUpdated(
  row: { updatedAt?: string; createdAt: string }
): string {
  return row.updatedAt ?? row.createdAt;
}

function rememberUser(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SYNC_USER_KEY, userId);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// —— row mappers: Supabase (snake) ↔ Dexie (camel) ——————————————————

function clientToRow(c: Client, userId: string) {
  return {
    id: c.id,
    user_id: userId,
    name: c.name,
    address: c.address ?? null,
    city: c.city ?? null,
    phone: c.phone ?? null,
    email: c.email ?? null,
    vat_number: c.vatNumber ?? null,
    notes: c.notes ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt
  };
}

function clientFromRow(r: Record<string, unknown>): Client {
  return {
    id: String(r.id),
    name: String(r.name),
    address: (r.address as string) ?? undefined,
    city: (r.city as string) ?? undefined,
    phone: (r.phone as string) ?? undefined,
    email: (r.email as string) ?? undefined,
    vatNumber: (r.vat_number as string) ?? undefined,
    notes: (r.notes as string) ?? undefined,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    syncedAt: new Date().toISOString(),
    remoteId: String(r.id)
  };
}

function spareToRow(s: SparePart, userId: string) {
  return {
    id: s.id,
    user_id: userId,
    sku: s.sku,
    name: s.name,
    unit: s.unit ?? null,
    min_stock: s.minStock ?? null,
    created_at: s.createdAt,
    updated_at: s.updatedAt
  };
}

function spareFromRow(r: Record<string, unknown>): SparePart {
  return {
    id: String(r.id),
    sku: String(r.sku),
    name: String(r.name),
    unit: (r.unit as string) ?? undefined,
    minStock: r.min_stock != null ? Number(r.min_stock) : undefined,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    syncedAt: new Date().toISOString(),
    remoteId: String(r.id)
  };
}

function attachmentToRow(a: Attachment, userId: string, storage_path: string) {
  return {
    id: a.id,
    user_id: userId,
    kind: a.kind,
    mime: a.mime,
    name: a.name ?? null,
    size: a.size ?? null,
    storage_path,
    created_at: a.createdAt,
    updated_at: a.updatedAt ?? a.createdAt
  };
}

function attachmentFromRow(
  r: Record<string, unknown>,
  blob: Blob
): Attachment {
  return {
    id: String(r.id),
    kind: r.kind as Attachment["kind"],
    mime: String(r.mime),
    name: (r.name as string) ?? undefined,
    size: r.size != null ? Number(r.size) : undefined,
    blob,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    cloudStoragePath: r.storage_path ? String(r.storage_path) : undefined,
    syncedAt: new Date().toISOString(),
    remoteId: String(r.id)
  };
}

function interventionGeoToJson(
  g: Intervention["startLocation"] | Intervention["endLocation"] | undefined
) {
  if (!g || typeof g.lat !== "number" || typeof g.lng !== "number") return null;
  return { address: g.address ?? "", lat: g.lat, lng: g.lng };
}

function interventionGeoFromJson(
  v: unknown
): Intervention["startLocation"] | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng, address: String(o.address ?? "") };
}

function interventionToRow(i: Intervention, userId: string) {
  return {
    id: i.id,
    user_id: userId,
    client_id: i.clientId,
    created_by: i.createdBy ?? null,
    type: i.type,
    work_category: i.workCategory ?? "intervention",
    is_office_activity: i.isOfficeActivity ?? false,
    status: i.status ?? null,
    start_at: i.startAt,
    end_at: i.endAt ?? null,
    duration_minutes: i.durationMinutes ?? null,
    timer_started_at: i.timerStartedAt ?? null,
    timer_run_state: i.timerRunState ?? "idle",
    timer_accumulated_seconds: Math.max(0, Math.floor(i.timerAccumulatedSeconds ?? 0)),
    due_at: i.dueAt ?? null,
    reminders_enabled: i.remindersEnabled ?? false,
    reminder_preset: i.reminderPreset ?? null,
    reminder_custom_at: i.reminderCustomAt ?? null,
    reminder_email_to: i.reminderEmailTo ?? null,
    reminder_last_fire_at: i.reminderLastFireAt ?? null,
    start_location: interventionGeoToJson(i.startLocation),
    end_location: interventionGeoToJson(i.endLocation),
    location_km_auto: i.locationKmAuto ?? null,
    km: i.km ?? null,
    notes: i.notes ?? null,
    photo_ids: i.photoIds?.length ? i.photoIds : null,
    document_ids: i.documentIds?.length ? i.documentIds : null,
    voice_note_ids: i.voiceNoteIds?.length ? i.voiceNoteIds : null,
    checklist: i.checklist ?? null,
    spare_parts_used: i.sparePartsUsed ?? null,
    created_at: i.createdAt,
    updated_at: i.updatedAt
  };
}

function interventionFromRow(r: Record<string, unknown>): Intervention {
  const photoIds = (r.photo_ids as string[] | null) ?? undefined;
  const documentIds = (r.document_ids as string[] | null) ?? undefined;
  const voiceNoteIds = (r.voice_note_ids as string[] | null) ?? undefined;
  const wc = r.work_category;
  const workCategory: Intervention["workCategory"] =
    wc === "activity" ? "activity" : "intervention";
  const trs = r.timer_run_state;
  const timerRunState: Intervention["timerRunState"] =
    trs === "running" || trs === "paused" || trs === "idle" ? trs : undefined;
  const reminderPreset = r.reminder_preset as Intervention["reminderPreset"] | undefined;
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    createdBy: (r.created_by as string) ?? undefined,
    type: String(r.type ?? "maintenance"),
    workCategory,
    isOfficeActivity: Boolean(r.is_office_activity),
    status: (r.status as Intervention["status"]) ?? undefined,
    startAt: iso(r.start_at),
    endAt: r.end_at ? iso(r.end_at) : undefined,
    durationMinutes:
      r.duration_minutes != null ? Number(r.duration_minutes) : undefined,
    timerAccumulatedSeconds:
      r.timer_accumulated_seconds != null
        ? Math.max(0, Math.floor(Number(r.timer_accumulated_seconds)))
        : 0,
    timerRunState: timerRunState ?? (r.timer_started_at ? "running" : "idle"),
    timerStartedAt: r.timer_started_at ? iso(r.timer_started_at) : undefined,
    dueAt: r.due_at ? iso(r.due_at) : undefined,
    remindersEnabled: Boolean(r.reminders_enabled),
    reminderPreset:
      reminderPreset === "1d" ||
      reminderPreset === "2h" ||
      reminderPreset === "30m" ||
      reminderPreset === "custom"
        ? reminderPreset
        : undefined,
    reminderCustomAt: r.reminder_custom_at ? iso(r.reminder_custom_at) : undefined,
    reminderEmailTo: (r.reminder_email_to as string) ?? undefined,
    reminderLastFireAt: r.reminder_last_fire_at ? iso(r.reminder_last_fire_at) : undefined,
    startLocation: interventionGeoFromJson(r.start_location),
    endLocation: interventionGeoFromJson(r.end_location),
    locationKmAuto:
      r.location_km_auto != null ? Number(r.location_km_auto) : undefined,
    km: r.km != null ? Number(r.km) : undefined,
    notes: (r.notes as string) ?? undefined,
    photoIds: photoIds ?? undefined,
    documentIds: documentIds ?? undefined,
    voiceNoteIds: voiceNoteIds ?? undefined,
    checklist: (r.checklist as Intervention["checklist"]) ?? undefined,
    sparePartsUsed:
      (r.spare_parts_used as Intervention["sparePartsUsed"]) ?? undefined,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    syncedAt: new Date().toISOString(),
    remoteId: String(r.id)
  };
}

function stockToRow(m: StockMovement, userId: string) {
  const u = m.updatedAt ?? m.createdAt;
  return {
    id: m.id,
    user_id: userId,
    spare_part_id: m.sparePartId,
    type: m.type,
    qty: m.qty,
    reason: m.reason ?? null,
    intervention_id: m.interventionId ?? null,
    created_at: m.createdAt,
    updated_at: u
  };
}

function stockFromRow(r: Record<string, unknown>): StockMovement {
  const createdAt = iso(r.created_at);
  const updatedAt = iso(r.updated_at);
  return {
    id: String(r.id),
    sparePartId: String(r.spare_part_id),
    type: r.type as StockMovement["type"],
    qty: Number(r.qty),
    reason: (r.reason as string) ?? undefined,
    interventionId: (r.intervention_id as string) ?? undefined,
    createdAt,
    updatedAt,
    syncedAt: new Date().toISOString(),
    remoteId: String(r.id)
  };
}

function ticketToRow(t: Ticket, userId: string) {
  return {
    id: t.id,
    user_id: userId,
    title: t.title,
    description: t.description ?? null,
    client_id: t.clientId ?? null,
    intervention_id: t.interventionId ?? null,
    priority: t.priority,
    status: t.status,
    reminder_at: t.reminderAt ?? null,
    due_at: t.dueAt ?? null,
    created_at: t.createdAt,
    updated_at: t.updatedAt
  };
}

function ticketFromRow(r: Record<string, unknown>): Ticket {
  return {
    id: String(r.id),
    title: String(r.title),
    description: (r.description as string) ?? undefined,
    clientId: (r.client_id as string) ?? undefined,
    interventionId: (r.intervention_id as string) ?? undefined,
    priority: r.priority as Ticket["priority"],
    status: r.status as Ticket["status"],
    reminderAt: r.reminder_at ? iso(r.reminder_at) : undefined,
    dueAt: r.due_at ? iso(r.due_at) : undefined,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    syncedAt: new Date().toISOString(),
    remoteId: String(r.id)
  };
}

function documentToRow(d: Document, userId: string) {
  const u = d.updatedAt ?? d.createdAt;
  return {
    id: d.id,
    user_id: userId,
    intervention_id: d.interventionId ?? null,
    title: d.title,
    attachment_id: d.attachmentId,
    page_count: d.pageCount,
    created_at: d.createdAt,
    updated_at: u
  };
}

function documentFromRow(r: Record<string, unknown>): Document {
  const createdAt = iso(r.created_at);
  const updatedAt = iso(r.updated_at);
  return {
    id: String(r.id),
    interventionId: (r.intervention_id as string) ?? undefined,
    title: String(r.title),
    attachmentId: String(r.attachment_id),
    pageCount: Number(r.page_count ?? 1),
    createdAt,
    updatedAt,
    syncedAt: new Date().toISOString(),
    remoteId: String(r.id)
  };
}

function outboxToRow(o: SupportEmailOutboxItem, userId: string) {
  return {
    id: o.id,
    user_id: userId,
    status: o.status,
    to_addr: o.to,
    title: o.title,
    note: o.note ?? null,
    document_id: o.documentId ?? null,
    intervention_id: o.interventionId ?? null,
    attachment_id: o.attachmentId,
    last_error: o.lastError ?? null,
    created_at: o.createdAt,
    updated_at: o.updatedAt
  };
}

function outboxFromRow(r: Record<string, unknown>): SupportEmailOutboxItem {
  return {
    id: String(r.id),
    status: r.status as SupportEmailOutboxItem["status"],
    to: String(r.to_addr),
    title: String(r.title),
    note: (r.note as string) ?? undefined,
    documentId: (r.document_id as string) ?? undefined,
    interventionId: (r.intervention_id as string) ?? undefined,
    attachmentId: String(r.attachment_id),
    lastError: (r.last_error as string) ?? undefined,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    syncedAt: new Date().toISOString(),
    remoteId: String(r.id)
  };
}

function templateToRow(t: InterventionTemplate, userId: string) {
  return {
    id: t.id,
    user_id: userId,
    name: t.name,
    client_name: t.clientName ?? null,
    default_client_id: t.defaultClientId ?? null,
    type: t.type,
    work_category: t.workCategory ?? "intervention",
    is_office_activity: t.isOfficeActivity ?? false,
    default_duration_minutes: t.defaultDurationMinutes ?? null,
    km: t.km ?? null,
    notes: t.notes ?? null,
    checklist: t.checklist ?? null,
    spare_parts_used: t.sparePartsUsed ?? null,
    created_at: t.createdAt,
    updated_at: t.updatedAt
  };
}

function templateFromRow(r: Record<string, unknown>): InterventionTemplate {
  const twc = r.work_category;
  const workCategory: InterventionTemplate["workCategory"] =
    twc === "activity" ? "activity" : "intervention";
  return {
    id: String(r.id),
    name: String(r.name),
    clientName: (r.client_name as string) ?? undefined,
    defaultClientId: r.default_client_id ? String(r.default_client_id) : undefined,
    type: String(r.type ?? "maintenance"),
    workCategory,
    isOfficeActivity: Boolean(r.is_office_activity),
    defaultDurationMinutes:
      r.default_duration_minutes != null ? Number(r.default_duration_minutes) : undefined,
    km: r.km != null ? Number(r.km) : undefined,
    notes: (r.notes as string) ?? undefined,
    checklist: (r.checklist as InterventionTemplate["checklist"]) ?? undefined,
    sparePartsUsed:
      (r.spare_parts_used as InterventionTemplate["sparePartsUsed"]) ??
      undefined,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    syncedAt: new Date().toISOString(),
    remoteId: String(r.id)
  };
}

async function pullPagedImpl(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  orderCol: string
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .order(orderCol, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table} pull: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

/** Pull all pages with a few retries for transient network errors. */
async function pullPaged(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  orderCol: string
): Promise<Record<string, unknown>[]> {
  let last: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await pullPagedImpl(supabase, table, userId, orderCol);
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e));
      if (attempt < 2) {
        await sleep(450 * 2 ** attempt + Math.floor(Math.random() * 200));
      }
    }
  }
  throw last ?? new Error("pull failed");
}

export async function upsertBatch(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[]
) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, {
    onConflict: "id"
  });
  if (error) throw new Error(`${table} upsert: ${error.message}`);
}

async function markSynced(
  table:
    | "clients"
    | "interventions"
    | "spareParts"
    | "stockMovements"
    | "tickets"
    | "attachments"
    | "documents"
    | "supportEmailOutbox"
    | "templates",
  id: string
) {
  const now = new Date().toISOString();
  switch (table) {
    case "clients":
      await db.clients.update(id, { syncedAt: now });
      break;
    case "interventions":
      await db.interventions.update(id, { syncedAt: now });
      break;
    case "spareParts":
      await db.spareParts.update(id, { syncedAt: now });
      break;
    case "stockMovements":
      await db.stockMovements.update(id, { syncedAt: now });
      break;
    case "tickets":
      await db.tickets.update(id, { syncedAt: now });
      break;
    case "attachments":
      await db.attachments.update(id, { syncedAt: now });
      break;
    case "documents":
      await db.documents.update(id, { syncedAt: now });
      break;
    case "supportEmailOutbox":
      await db.supportEmailOutbox.update(id, { syncedAt: now });
      break;
    case "templates":
      await db.templates.update(id, { syncedAt: now });
      break;
    default:
      break;
  }
}

// —— Push phases ——————————————————————————————————————————

async function pushAttachments(
  supabase: SupabaseClient,
  userId: string,
  errors: string[]
): Promise<number> {
  const {
    data: { session }
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const all = await db.attachments.toArray();
  const dirty = all.filter((a) =>
    isDirty(effectiveUpdated({ updatedAt: a.updatedAt, createdAt: a.createdAt }), a.syncedAt)
  );
  let n = 0;
  for (const a of dirty) {
    try {
      const path = buildAttachmentStoragePath(userId, a.id, a.name);

      if (accessToken && baseUrl && anonKey) {
        await uploadToSupabaseStorageWithRetries({
          supabaseUrl: baseUrl,
          anonKey,
          accessToken,
          bucket: STORAGE_BUCKET,
          objectPath: path,
          body: a.blob,
          contentType: a.mime || "application/octet-stream",
          upsert: true,
          maxRetries: 3
        });
      } else {
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, a.blob, {
            upsert: true,
            contentType: a.mime || "application/octet-stream"
          });
        if (upErr) throw upErr;
      }

      await upsertBatch(supabase, "wf_attachments", [
        attachmentToRow(a, userId, path)
      ]);
      const nowIso = new Date().toISOString();
      await db.attachments.update(a.id, {
        syncedAt: nowIso,
        cloudStoragePath: path,
        updatedAt: a.updatedAt ?? nowIso
      });
      n += 1;
    } catch (e: unknown) {
      errors.push(
        `attachment ${a.id}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
  return n;
}

async function pushClients(supabase: SupabaseClient, userId: string) {
  const rows = await db.clients.toArray();
  const dirty = rows.filter((r) => isDirty(r.updatedAt, r.syncedAt));
  let n = 0;
  for (const batch of chunk(dirty, 80)) {
    await upsertBatch(
      supabase,
      "wf_clients",
      batch.map((c) => clientToRow(c, userId))
    );
    for (const c of batch) {
      await markSynced("clients", c.id);
      n += 1;
    }
  }
  return n;
}

async function pushSpareParts(supabase: SupabaseClient, userId: string) {
  const rows = await db.spareParts.toArray();
  const dirty = rows.filter((r) => isDirty(r.updatedAt, r.syncedAt));
  let n = 0;
  for (const batch of chunk(dirty, 80)) {
    await upsertBatch(
      supabase,
      "wf_spare_parts",
      batch.map((s) => spareToRow(s, userId))
    );
    for (const s of batch) {
      await markSynced("spareParts", s.id);
      n += 1;
    }
  }
  return n;
}

async function pushTemplates(supabase: SupabaseClient, userId: string) {
  const rows = await db.templates.toArray();
  const dirty = rows.filter((r) => isDirty(r.updatedAt, r.syncedAt));
  let n = 0;
  for (const batch of chunk(dirty, 80)) {
    await upsertBatch(
      supabase,
      "wf_templates",
      batch.map((t) => templateToRow(t, userId))
    );
    for (const t of batch) {
      await markSynced("templates", t.id);
      n += 1;
    }
  }
  return n;
}

async function pushInterventions(supabase: SupabaseClient, userId: string) {
  const rows = await db.interventions.toArray();
  const dirty = rows.filter((r) => isDirty(r.updatedAt, r.syncedAt));
  let n = 0;
  for (const batch of chunk(dirty, 50)) {
    await upsertBatch(
      supabase,
      "wf_interventions",
      batch.map((i) => interventionToRow(i, userId))
    );
    for (const i of batch) {
      await markSynced("interventions", i.id);
      n += 1;
    }
  }
  return n;
}

async function pushStock(supabase: SupabaseClient, userId: string) {
  const rows = await db.stockMovements.toArray();
  const dirty = rows.filter((r) =>
    isDirty(effectiveUpdated({ updatedAt: r.updatedAt, createdAt: r.createdAt }), r.syncedAt)
  );
  let n = 0;
  for (const batch of chunk(dirty, 80)) {
    await upsertBatch(
      supabase,
      "wf_stock_movements",
      batch.map((m) => stockToRow(m, userId))
    );
    for (const m of batch) {
      await markSynced("stockMovements", m.id);
      n += 1;
    }
  }
  return n;
}

async function pushTickets(supabase: SupabaseClient, userId: string) {
  const rows = await db.tickets.toArray();
  const dirty = rows.filter((r) => isDirty(r.updatedAt, r.syncedAt));
  let n = 0;
  for (const batch of chunk(dirty, 80)) {
    await upsertBatch(
      supabase,
      "wf_tickets",
      batch.map((t) => ticketToRow(t, userId))
    );
    for (const t of batch) {
      await markSynced("tickets", t.id);
      n += 1;
    }
  }
  return n;
}

async function pushDocuments(supabase: SupabaseClient, userId: string) {
  const rows = await db.documents.toArray();
  const dirty = rows.filter((d) =>
    isDirty(effectiveUpdated({ updatedAt: d.updatedAt, createdAt: d.createdAt }), d.syncedAt)
  );
  let n = 0;
  for (const batch of chunk(dirty, 80)) {
    await upsertBatch(
      supabase,
      "wf_documents",
      batch.map((d) => documentToRow(d, userId))
    );
    for (const d of batch) {
      await markSynced("documents", d.id);
      n += 1;
    }
  }
  return n;
}

async function pushOutbox(supabase: SupabaseClient, userId: string) {
  const rows = await db.supportEmailOutbox.toArray();
  const dirty = rows.filter((r) => isDirty(r.updatedAt, r.syncedAt));
  let n = 0;
  for (const batch of chunk(dirty, 40)) {
    await upsertBatch(
      supabase,
      "wf_support_email_outbox",
      batch.map((o) => outboxToRow(o, userId))
    );
    for (const o of batch) {
      await markSynced("supportEmailOutbox", o.id);
      n += 1;
    }
  }
  return n;
}

// —— Pull + LWW ————————————————————————————————————————————

async function pullClients(supabase: SupabaseClient, userId: string) {
  const rows = await pullPaged(supabase, "wf_clients", userId, "updated_at");
  let n = 0;
  for (const r of rows) {
    const remoteU = iso(r.updated_at);
    const local = await db.clients.get(String(r.id));
    if (local && shouldSkipRemoteMerge(remoteU, local)) continue;
    await db.clients.put(clientFromRow(r));
    n += 1;
  }
  return n;
}

async function pullSpares(supabase: SupabaseClient, userId: string) {
  const rows = await pullPaged(supabase, "wf_spare_parts", userId, "updated_at");
  let n = 0;
  for (const r of rows) {
    const remoteU = iso(r.updated_at);
    const local = await db.spareParts.get(String(r.id));
    if (local && shouldSkipRemoteMerge(remoteU, local)) continue;
    await db.spareParts.put(spareFromRow(r));
    n += 1;
  }
  return n;
}

async function pullAttachments(supabase: SupabaseClient, userId: string) {
  const rows = await pullPaged(supabase, "wf_attachments", userId, "updated_at");
  const pend = getPendingInterventionPullSkipContext();
  let n = 0;
  for (const r of rows) {
    const remoteU = iso(r.updated_at);
    const id = String(r.id);
    if (pend.attachmentIds.has(id)) continue;
    const local = await db.attachments.get(id);
    const localU = local
      ? effectiveUpdated({ updatedAt: local.updatedAt, createdAt: local.createdAt })
      : "";
    if (local && shouldSkipRemoteMergeTs(remoteU, localU, local.syncedAt)) continue;

    const path = String(r.storage_path);
    let file: Blob | null = null;
    const primary = await supabase.storage.from(STORAGE_BUCKET).download(path);
    if (!primary.error && primary.data) file = primary.data;
    if (!file) {
      const legacy = legacyAttachmentStoragePath(userId, id);
      if (legacy !== path) {
        const second = await supabase.storage.from(STORAGE_BUCKET).download(legacy);
        if (!second.error && second.data) file = second.data;
      }
    }
    if (!file) {
      console.warn("[sync] attachment download skipped", id);
      continue;
    }
    await db.attachments.put(attachmentFromRow(r, file));
    n += 1;
  }
  return n;
}

async function pullInterventions(supabase: SupabaseClient, userId: string) {
  const rows = await pullPaged(supabase, "wf_interventions", userId, "updated_at");
  const pend = getPendingInterventionPullSkipContext();
  const serverIds = new Set<string>();
  let n = 0;
  for (const r of rows) {
    const id = String(r.id);
    serverIds.add(id);
    if (pend.interventionIds.has(id)) continue;
    const remoteU = iso(r.updated_at);
    const local = await db.interventions.get(id);
    if (local && shouldSkipRemoteMerge(remoteU, local)) continue;
    await db.interventions.put(interventionFromRow(r));
    n += 1;
  }

  // Tombstone sync: pull only upserts — rows deleted on another device never appear in `rows`.
  const locals = await db.interventions.toArray();
  for (const local of locals) {
    if (serverIds.has(local.id)) continue;
    if (pend.interventionIds.has(local.id)) continue;
    if (!local.syncedAt) continue;
    console.info(
      "[sync] pull: removing intervention absent on server (remote delete)",
      local.id
    );
    await purgeInterventionLocallyById(local.id);
  }

  return n;
}

async function pullStock(supabase: SupabaseClient, userId: string) {
  const rows = await pullPaged(
    supabase,
    "wf_stock_movements",
    userId,
    "updated_at"
  );
  const pend = getPendingInterventionPullSkipContext();
  let n = 0;
  for (const r of rows) {
    const rowId = String(r.id);
    if (pend.stockMovementIds.has(rowId)) continue;
    const ivRef = (r.intervention_id as string) ?? "";
    if (ivRef && pend.interventionIds.has(ivRef)) continue;
    const remoteU = iso(r.updated_at);
    const local = await db.stockMovements.get(rowId);
    const localU = local
      ? effectiveUpdated({ updatedAt: local.updatedAt, createdAt: local.createdAt })
      : "";
    if (local && shouldSkipRemoteMergeTs(remoteU, localU, local.syncedAt)) continue;
    await db.stockMovements.put(stockFromRow(r));
    n += 1;
  }
  return n;
}

async function pullTickets(supabase: SupabaseClient, userId: string) {
  const rows = await pullPaged(supabase, "wf_tickets", userId, "updated_at");
  let n = 0;
  for (const r of rows) {
    const remoteU = iso(r.updated_at);
    const local = await db.tickets.get(String(r.id));
    if (local && shouldSkipRemoteMerge(remoteU, local)) continue;
    await db.tickets.put(ticketFromRow(r));
    n += 1;
  }
  return n;
}

async function pullDocuments(supabase: SupabaseClient, userId: string) {
  const rows = await pullPaged(supabase, "wf_documents", userId, "updated_at");
  const pend = getPendingInterventionPullSkipContext();
  let n = 0;
  for (const r of rows) {
    const rowId = String(r.id);
    if (pend.documentIds.has(rowId)) continue;
    const ivRef = (r.intervention_id as string) ?? "";
    if (ivRef && pend.interventionIds.has(ivRef)) continue;
    const remoteU = iso(r.updated_at);
    const local = await db.documents.get(rowId);
    const localU = local
      ? effectiveUpdated({ updatedAt: local.updatedAt, createdAt: local.createdAt })
      : "";
    if (local && shouldSkipRemoteMergeTs(remoteU, localU, local.syncedAt)) continue;
    await db.documents.put(documentFromRow(r));
    n += 1;
  }
  return n;
}

async function pullOutbox(supabase: SupabaseClient, userId: string) {
  const rows = await pullPaged(
    supabase,
    "wf_support_email_outbox",
    userId,
    "updated_at"
  );
  const pend = getPendingInterventionPullSkipContext();
  let n = 0;
  for (const r of rows) {
    const rowId = String(r.id);
    if (pend.outboxIds.has(rowId)) continue;
    const ivRef = (r.intervention_id as string) ?? "";
    if (ivRef && pend.interventionIds.has(ivRef)) continue;
    const remoteU = iso(r.updated_at);
    const local = await db.supportEmailOutbox.get(rowId);
    if (local && shouldSkipRemoteMerge(remoteU, local)) continue;
    await db.supportEmailOutbox.put(outboxFromRow(r));
    n += 1;
  }
  return n;
}

async function pullTemplates(supabase: SupabaseClient, userId: string) {
  const rows = await pullPaged(supabase, "wf_templates", userId, "updated_at");
  let n = 0;
  for (const r of rows) {
    const remoteU = iso(r.updated_at);
    const local = await db.templates.get(String(r.id));
    if (local && shouldSkipRemoteMerge(remoteU, local)) continue;
    await db.templates.put(templateFromRow(r));
    n += 1;
  }
  return n;
}

// —— Public API —————————————————————————————————————————————

let syncSupabase: SupabaseClient | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<SyncResult> | null = null;
/** Avoid Dexie hooks re-scheduling sync while a run is mutating Dexie. */
let syncMutationDepth = 0;

export function setSyncSupabaseClient(client: SupabaseClient | null) {
  syncSupabase = client;
}

export function scheduleWorkflowSync() {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) {
    useSyncUiStore.getState().setPhase("offline_pending");
    void refreshPendingDirtyCount();
    return;
  }
  if (syncMutationDepth > 0) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const c = syncSupabase;
    if (c) void runFullSync(c);
  }, SYNC_DEBOUNCE_MS);
}

let hooksRegistered = false;

export function registerWorkflowDexieSyncHooks() {
  if (typeof window === "undefined" || hooksRegistered) return;
  hooksRegistered = true;
  const hook = () => scheduleWorkflowSync();
  db.clients.hook("creating", hook);
  db.clients.hook("updating", hook);
  db.clients.hook("deleting", hook);
  db.interventions.hook("creating", hook);
  db.interventions.hook("updating", hook);
  db.interventions.hook("deleting", hook);
  db.spareParts.hook("creating", hook);
  db.spareParts.hook("updating", hook);
  db.spareParts.hook("deleting", hook);
  db.stockMovements.hook("creating", hook);
  db.stockMovements.hook("updating", hook);
  db.stockMovements.hook("deleting", hook);
  db.tickets.hook("creating", hook);
  db.tickets.hook("updating", hook);
  db.tickets.hook("deleting", hook);
  db.attachments.hook("creating", hook);
  db.attachments.hook("updating", hook);
  db.attachments.hook("deleting", hook);
  db.documents.hook("creating", hook);
  db.documents.hook("updating", hook);
  db.documents.hook("deleting", hook);
  db.supportEmailOutbox.hook("creating", hook);
  db.supportEmailOutbox.hook("updating", hook);
  db.supportEmailOutbox.hook("deleting", hook);
  db.templates.hook("creating", hook);
  db.templates.hook("updating", hook);
  db.templates.hook("deleting", hook);
}

export async function runFullSync(
  supabase: SupabaseClient
): Promise<SyncResult> {
  if (inflight) return inflight;

  const result: SyncResult = {
    ok: true,
    pushed: {},
    pulled: {},
    errors: [],
    skipped: false
  };

  inflight = (async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      result.skipped = true;
      result.reason = "offline";
      result.ok = false;
      useSyncUiStore.getState().setPhase("offline_pending");
      void refreshPendingDirtyCount();
      return result;
    }

    const {
      data: { user },
      error: userErr
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      result.skipped = true;
      result.reason = "not_authenticated";
      result.ok = false;
      useSyncUiStore.getState().setPhase("idle");
      return result;
    }

    rememberUser(user.id);
    useSyncUiStore.getState().setPhase("syncing");
    syncMutationDepth += 1;
    try {
      await flushPendingInterventionDeletes(supabase, user.id);
      syncAuditLog("full_sync_start", { userId: user.id });

      // Push FK-safe order
      result.pushed.clients = await pushClients(supabase, user.id);
      result.pushed.spareParts = await pushSpareParts(supabase, user.id);
      result.pushed.attachments = await pushAttachments(supabase, user.id, result.errors);
      result.pushed.templates = await pushTemplates(supabase, user.id);
      result.pushed.interventions = await pushInterventions(supabase, user.id);
      result.pushed.stockMovements = await pushStock(supabase, user.id);
      result.pushed.tickets = await pushTickets(supabase, user.id);
      result.pushed.documents = await pushDocuments(supabase, user.id);
      result.pushed.supportEmailOutbox = await pushOutbox(supabase, user.id);

      // Pull same order (attachments before docs that reference them is satisfied after interventions)
      result.pulled.clients = await pullClients(supabase, user.id);
      result.pulled.spareParts = await pullSpares(supabase, user.id);
      result.pulled.attachments = await pullAttachments(supabase, user.id);
      result.pulled.templates = await pullTemplates(supabase, user.id);
      result.pulled.interventions = await pullInterventions(supabase, user.id);
      result.pulled.stockMovements = await pullStock(supabase, user.id);
      result.pulled.tickets = await pullTickets(supabase, user.id);
      result.pulled.documents = await pullDocuments(supabase, user.id);
      result.pulled.supportEmailOutbox = await pullOutbox(supabase, user.id);

      await flushPendingInterventionDeletes(supabase, user.id);

      result.ok = result.errors.length === 0;

      const attErrs = result.errors.filter((e) => e.startsWith("attachment "));
      if (attErrs.length) {
        pushSyncFailure({
          kind: "upload",
          title: `${attErrs.length} attachment upload(s) need retry`,
          detail: attErrs.slice(0, 4).join("; ")
        });
      }
    } catch (e: unknown) {
      result.ok = false;
      result.errors.push(e instanceof Error ? e.message : String(e));
    } finally {
      syncMutationDepth -= 1;
      const clean = result.errors.length === 0 && result.ok;
      useSyncUiStore
        .getState()
        .setFullSyncDone(
          clean,
          result.errors.length ? result.errors.join("; ") : null
        );
      if (!result.skipped && clean) {
        autoSyncRetryAttempt = 0;
        cancelAutomatedSyncRetry();
        useSyncFailureQueue.getState().clearKind("sync");
        syncAuditLog("full_sync_ok", {
          pushed: result.pushed,
          pulled: result.pulled
        });
      } else if (!result.skipped && !clean) {
        syncAuditLog("full_sync_errors", { errors: result.errors });
        const nonAtt = result.errors.filter((e) => !e.startsWith("attachment "));
        if (nonAtt.length) {
          pushSyncFailure({
            kind: "sync",
            title: "Sync incomplete",
            detail: nonAtt.slice(0, 6).join("; ")
          });
        }
        autoSyncRetryAttempt = Math.min(autoSyncRetryAttempt + 1, 8);
        scheduleAutomatedSyncRetry();
      }
      void refreshPendingDirtyCount();
    }

    return result;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export async function refreshPendingDirtyCount(): Promise<void> {
  const n = await computePendingDirtyCount();
  useSyncUiStore.getState().setDirtyCount(n);
}

export async function computePendingDirtyCount(): Promise<number> {
  let n = 0;
  for (const r of await db.clients.toArray()) {
    if (isDirty(r.updatedAt, r.syncedAt)) n += 1;
  }
  for (const r of await db.interventions.toArray()) {
    if (isDirty(r.updatedAt, r.syncedAt)) n += 1;
  }
  for (const r of await db.spareParts.toArray()) {
    if (isDirty(r.updatedAt, r.syncedAt)) n += 1;
  }
  for (const r of await db.stockMovements.toArray()) {
    const u = effectiveUpdated({ updatedAt: r.updatedAt, createdAt: r.createdAt });
    if (isDirty(u, r.syncedAt)) n += 1;
  }
  for (const r of await db.tickets.toArray()) {
    if (isDirty(r.updatedAt, r.syncedAt)) n += 1;
  }
  for (const r of await db.attachments.toArray()) {
    const u = effectiveUpdated({ updatedAt: r.updatedAt, createdAt: r.createdAt });
    if (isDirty(u, r.syncedAt)) n += 1;
  }
  for (const r of await db.documents.toArray()) {
    const u = effectiveUpdated({ updatedAt: r.updatedAt, createdAt: r.createdAt });
    if (isDirty(u, r.syncedAt)) n += 1;
  }
  for (const r of await db.supportEmailOutbox.toArray()) {
    if (isDirty(r.updatedAt, r.syncedAt)) n += 1;
  }
  for (const r of await db.templates.toArray()) {
    if (isDirty(r.updatedAt, r.syncedAt)) n += 1;
  }
  return n;
}

export async function runManualFullSync(): Promise<SyncResult | null> {
  const c = syncSupabase;
  if (!c) return null;
  return runFullSync(c);
}

/**
 * Flush pending remote deletes, run a full sync, and bump UI query epoch (Settings / power users).
 */
export async function runForceFullWorkflowSync(): Promise<SyncResult | null> {
  const c = syncSupabase;
  if (!c) return null;
  cancelAutomatedSyncRetry();
  const {
    data: { user }
  } = await c.auth.getUser();
  if (user) {
    await flushPendingInterventionDeletes(c, user.id);
  }
  const r = await runFullSync(c);
  useSyncUiStore.getState().bumpLiveQueryEpoch();
  return r;
}

type RealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE" | string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
  table: string;
};

export async function applyRealtimePostgresChange(
  supabase: SupabaseClient,
  userId: string,
  payload: RealtimePayload
): Promise<void> {
  const { eventType, new: rec, old: prev, table } = payload;
  const ev = String(eventType).toUpperCase();
  const uid = String((rec ?? prev)?.user_id ?? "");
  if (uid && uid !== userId) return;

  syncMutationDepth += 1;
  try {
    if (ev === "DELETE") {
      const id = String(
        (prev as Record<string, unknown> | null)?.id ??
          (rec as Record<string, unknown> | null)?.id ??
          ""
      );
      if (!id) {
        console.warn("[sync] realtime DELETE skipped (missing id)", { table, prev, rec });
        return;
      }
      switch (table) {
        case "wf_clients":
          await db.clients.delete(id);
          break;
        case "wf_spare_parts":
          await db.spareParts.delete(id);
          break;
        case "wf_attachments":
          await db.attachments.delete(id);
          break;
        case "wf_interventions":
          await purgeInterventionLocallyById(id);
          console.info("[sync] realtime: remote intervention delete applied", id);
          break;
        case "wf_stock_movements":
          await db.stockMovements.delete(id);
          break;
        case "wf_tickets":
          await db.tickets.delete(id);
          break;
        case "wf_documents":
          await db.documents.delete(id);
          break;
        case "wf_support_email_outbox":
          await db.supportEmailOutbox.delete(id);
          break;
        case "wf_templates":
          await db.templates.delete(id);
          break;
        default:
          break;
      }
      useSyncUiStore.getState().touchRealtime();
      return;
    }

    const row = rec;
    if (!row) return;
    const remoteU = iso(row.updated_at ?? row.created_at);

    switch (table) {
      case "wf_clients": {
        const local = await db.clients.get(String(row.id));
        if (local && shouldSkipRemoteMerge(remoteU, local)) return;
        await db.clients.put(clientFromRow(row));
        break;
      }
      case "wf_spare_parts": {
        const local = await db.spareParts.get(String(row.id));
        if (local && shouldSkipRemoteMerge(remoteU, local)) return;
        await db.spareParts.put(spareFromRow(row));
        break;
      }
      case "wf_attachments": {
        const id = String(row.id);
        const local = await db.attachments.get(id);
        const localU = local
          ? effectiveUpdated({ updatedAt: local.updatedAt, createdAt: local.createdAt })
          : "";
        if (local && shouldSkipRemoteMergeTs(remoteU, localU, local.syncedAt)) return;
        const path = String(row.storage_path);
        let file: Blob | null = null;
        const first = await supabase.storage.from(STORAGE_BUCKET).download(path);
        if (!first.error && first.data) file = first.data;
        if (!file) {
          const legacy = legacyAttachmentStoragePath(userId, id);
          if (legacy !== path) {
            const second = await supabase.storage.from(STORAGE_BUCKET).download(legacy);
            if (!second.error && second.data) file = second.data;
          }
        }
        if (!file) return;
        await db.attachments.put(attachmentFromRow(row, file));
        break;
      }
      case "wf_interventions": {
        const local = await db.interventions.get(String(row.id));
        if (local && shouldSkipRemoteMerge(remoteU, local)) return;
        await db.interventions.put(interventionFromRow(row));
        break;
      }
      case "wf_stock_movements": {
        const local = await db.stockMovements.get(String(row.id));
        const localU = local
          ? effectiveUpdated({ updatedAt: local.updatedAt, createdAt: local.createdAt })
          : "";
        if (local && shouldSkipRemoteMergeTs(remoteU, localU, local.syncedAt)) return;
        await db.stockMovements.put(stockFromRow(row));
        break;
      }
      case "wf_tickets": {
        const local = await db.tickets.get(String(row.id));
        if (local && shouldSkipRemoteMerge(remoteU, local)) return;
        await db.tickets.put(ticketFromRow(row));
        break;
      }
      case "wf_documents": {
        const local = await db.documents.get(String(row.id));
        const localU = local
          ? effectiveUpdated({ updatedAt: local.updatedAt, createdAt: local.createdAt })
          : "";
        if (local && shouldSkipRemoteMergeTs(remoteU, localU, local.syncedAt)) return;
        await db.documents.put(documentFromRow(row));
        break;
      }
      case "wf_support_email_outbox": {
        const local = await db.supportEmailOutbox.get(String(row.id));
        if (local && shouldSkipRemoteMerge(remoteU, local)) return;
        await db.supportEmailOutbox.put(outboxFromRow(row));
        break;
      }
      case "wf_templates": {
        const local = await db.templates.get(String(row.id));
        if (local && shouldSkipRemoteMerge(remoteU, local)) return;
        await db.templates.put(templateFromRow(row));
        break;
      }
      default:
        break;
    }
    useSyncUiStore.getState().touchRealtime();
  } finally {
    syncMutationDepth -= 1;
  }
}
