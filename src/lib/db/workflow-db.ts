/**
 * IndexedDB schema and types for WorkFlow’s offline-first layer.
 *
 * Dexie holds the working copy of clients, interventions, attachments, etc.
 * The sync engine (`lib/sync/sync-engine.ts`) reconciles this store with Supabase;
 * version bumps here must stay in sync with migration expectations on the server.
 */
import Dexie, { type Table } from "dexie";
import type { WorkingHoursConfig } from "@/lib/interventions/working-hours";

export type Id = string;

/** Field work vs office / remote admin work (not the job category label in `type`). */
export type WorkCategory = "intervention" | "activity";

export type TimerRunState = "idle" | "running" | "paused";

export type ReminderPreset = "1d" | "2h" | "30m" | "custom";

/** User-controlled lifecycle (overdue is derived in UI from dueAt, not stored). */
export type InterventionWorkflowStatus = "open" | "in_progress" | "completed";

/** Start or end stop for route / KM. */
export type InterventionGeoStop = {
  address: string;
  lat: number;
  lng: number;
};

/** Optional metadata for Supabase ↔ Dexie sync (Section Sync 1). */
export type SyncMeta = {
  /** Last time this row was successfully reconciled with the cloud (ISO). */
  syncedAt?: string;
  /** Reserved for server-assigned ids; today local `id` is the canonical UUID everywhere. */
  remoteId?: string;
};

/** Synced with public.wf_clients.client_type (text). */
export type ClientType = "company" | "private" | "restaurant" | "shop" | "other";

export const CLIENT_TYPES: readonly ClientType[] = [
  "company",
  "private",
  "restaurant",
  "shop",
  "other"
] as const;

export type Client = {
  id: Id;
  name: string;
  contactPerson?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  /** Legacy cloud column; not shown or edited in the app. */
  vatNumber?: string;
  clientType?: ClientType;
  notes?: string;
  createdAt: string;
  updatedAt: string;
} & SyncMeta;

export type Intervention = {
  id: Id;
  clientId: Id;
  createdBy?: Id;
  /** Job category / label (free text; presets in UI). */
  type: string;
  workCategory: WorkCategory;
  /** When workCategory is activity: true = on-site office, false = remote/other. */
  isOfficeActivity?: boolean;
  status?: InterventionWorkflowStatus;
  /**
   * Optional start instant (ISO). Some rows are created as “to-do” items with only a due date
   * and reminders configured, then scheduled later.
   */
  startAt?: string;
  /** Optional end instant (ISO). */
  endAt?: string;
  durationMinutes?: number;
  /** Elapsed work time already counted (seconds); live segment adds (now - timerStartedAt) when running. */
  timerAccumulatedSeconds?: number;
  /** idle = no segment; running = timerStartedAt set; paused = accumulated frozen. */
  timerRunState?: TimerRunState;
  timerStartedAt?: string; // ISO - current running segment start
  /** Must complete by (deadline for countdown / overdue). */
  dueAt?: string;
  remindersEnabled?: boolean;
  reminderPreset?: ReminderPreset;
  /** When preset is `custom`, wall time to fire reminder (ISO). */
  reminderCustomAt?: string;
  reminderEmailTo?: string;
  /** @deprecated Prefer reminderPreDueAckAt / reminderDueAckAt. Optional legacy single ack. */
  reminderLastFireAt?: string;
  /** Successful pre-due (scheduled) reminder delivery — ISO instant acked for that tier only. */
  reminderPreDueAckAt?: string;
  /** Successful due / overdue reminder delivery — ISO instant acked for that tier only. */
  reminderDueAckAt?: string;
  startLocation?: InterventionGeoStop;
  endLocation?: InterventionGeoStop;
  /** Haversine or Google distance between start/end (read-only suggestion; user km may differ). */
  locationKmAuto?: number;
  km?: number;
  notes?: string;
  photoIds?: Id[];
  documentIds?: Id[];
  voiceNoteIds?: Id[];
  checklist?: { id: Id; label: string; done: boolean }[];
  sparePartsUsed?: { sparePartId: Id; qty: number }[];
  createdAt: string;
  updatedAt: string;
} & SyncMeta;

export type SparePart = {
  id: Id;
  sku: string;
  name: string;
  unit?: string;
  minStock?: number;
  createdAt: string;
  updatedAt: string;
} & SyncMeta;

export type StockMovement = {
  id: Id;
  sparePartId: Id;
  type: "in" | "out" | "adjust";
  qty: number;
  reason?: string;
  interventionId?: Id;
  createdAt: string;
  /** Server LWW field; defaults to createdAt when pushing if unset. */
  updatedAt?: string;
} & SyncMeta;

export type TicketStatus = "open" | "pending" | "closed";

export type TicketPriority = "low" | "medium" | "high";

export const TICKET_STATUSES: readonly TicketStatus[] = [
  "open",
  "pending",
  "closed"
] as const;

export const TICKET_PRIORITIES: readonly TicketPriority[] = [
  "low",
  "medium",
  "high"
] as const;

export type Ticket = {
  id: Id;
  title: string;
  description?: string;
  clientId?: Id;
  interventionId?: Id;
  priority: TicketPriority;
  status: TicketStatus;
  /** @deprecated Legacy single reminder instant; kept in sync with `dueAt` for back-compat. */
  reminderAt?: string; // ISO
  dueAt?: string; // ISO
  /** Pre-due + due reminder model (mirrors interventions / activities). */
  remindersEnabled?: boolean;
  reminderPreset?: ReminderPreset;
  /** When preset is `custom`, wall time to fire the pre-due reminder (ISO). */
  reminderCustomAt?: string;
  /** Successful pre-due reminder delivery — ISO instant acked for that tier only. */
  reminderPreDueAckAt?: string;
  /** Successful due / overdue reminder delivery — ISO instant acked for that tier only. */
  reminderDueAckAt?: string;
  createdAt: string;
  updatedAt: string;
} & SyncMeta;

/** Activities ("Attività"): flexible personal task list, more general than CRM tickets. */
export type ActivityStatus = "open" | "in_progress" | "completed" | "postponed";

export type ActivityPriority = "low" | "medium" | "high";

export const ACTIVITY_STATUSES: readonly ActivityStatus[] = [
  "open",
  "in_progress",
  "completed",
  "postponed"
] as const;

export const ACTIVITY_PRIORITIES: readonly ActivityPriority[] = [
  "low",
  "medium",
  "high"
] as const;

/** One entry in an activity's postponement history (append-only). */
export type ActivityPostponement = {
  id: Id;
  /** When the postponement was recorded (ISO). */
  at: string;
  /** User-provided reason for postponing. */
  reason?: string;
  /** Due date before this postponement (ISO), if any. */
  previousDueAt?: string;
  /** New due date set by this postponement (ISO), if any. */
  newDueAt?: string;
};

export type Activity = {
  id: Id;
  title: string;
  description?: string;
  /** Optional deadline including time (ISO). */
  dueAt?: string;
  remindersEnabled?: boolean;
  reminderPreset?: ReminderPreset;
  /** When preset is `custom`, wall time to fire the pre-due reminder (ISO). */
  reminderCustomAt?: string;
  /** Successful pre-due reminder delivery — ISO instant acked for that tier only. */
  reminderPreDueAckAt?: string;
  /** Successful due / overdue reminder delivery — ISO instant acked for that tier only. */
  reminderDueAckAt?: string;
  status: ActivityStatus;
  priority: ActivityPriority;
  /** Free-text category / comma-separated tags. */
  category?: string;
  /** Append-only log of postponements. */
  postponements?: ActivityPostponement[];
  createdAt: string;
  updatedAt: string;
} & SyncMeta;

/** Procedures & Troubleshooting: stored technical guides for on-site reference. */
export type ProcedureCategory = "general" | "brand_model";

export const PROCEDURE_CATEGORIES: readonly ProcedureCategory[] = [
  "general",
  "brand_model"
] as const;

export type Procedure = {
  id: Id;
  title: string;
  category: ProcedureCategory;
  brand?: string;
  model?: string;
  /** Sanitized rich-text body (HTML). */
  content?: string;
  /** Free-form tags for search/filtering. */
  tags?: string[];
  /** Attachment ids (kind "photo") shown in the procedure gallery. */
  imageIds?: Id[];
  createdAt: string;
  updatedAt: string;
} & SyncMeta;

export type Attachment = {
  id: Id;
  kind: "photo" | "document" | "audio";
  mime: string;
  name?: string;
  size?: number;
  blob: Blob;
  createdAt: string;
  updatedAt?: string;
  /** Supabase Storage object path after cloud persist (Section Sync 2). */
  cloudStoragePath?: string;
} & SyncMeta;

export type Document = {
  id: Id;
  interventionId?: Id;
  title: string;
  attachmentId: Id; // PDF blob in attachments
  pageCount: number;
  createdAt: string;
  updatedAt?: string;
} & SyncMeta;

export type SupportEmailOutboxItem = {
  id: Id;
  status: "queued" | "sending" | "sent" | "error";
  to: string;
  title: string;
  note?: string;
  documentId?: Id;
  interventionId?: Id;
  attachmentId: Id;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
} & SyncMeta;

/** Per-user settings row (id === user_id). Working hours sync across devices. */
export type UserSettings = {
  id: Id;
  workingHours: WorkingHoursConfig;
  createdAt: string;
  updatedAt: string;
} & SyncMeta;

export type InterventionTemplate = {
  id: Id;
  name: string;
  /** Hint name when defaultClientId is unset ("new client" each time). */
  clientName?: string;
  /** Saved client for prefilled visits; omit/null = new client each time. */
  defaultClientId?: Id | null;
  type: string;
  workCategory: WorkCategory;
  isOfficeActivity?: boolean;
  defaultDurationMinutes?: number;
  km?: number;
  notes?: string;
  checklist?: { id: Id; label: string; done: boolean }[];
  sparePartsUsed?: { sparePartId: Id; qty: number }[];
  createdAt: string;
  updatedAt: string;
} & SyncMeta;

/** Dexie database: one logical DB name (`workflow`) with versioned stores. */
export class WorkFlowDB extends Dexie {
  clients!: Table<Client, Id>;
  interventions!: Table<Intervention, Id>;
  spareParts!: Table<SparePart, Id>;
  stockMovements!: Table<StockMovement, Id>;
  tickets!: Table<Ticket, Id>;
  attachments!: Table<Attachment, Id>;
  documents!: Table<Document, Id>;
  supportEmailOutbox!: Table<SupportEmailOutboxItem, Id>;
  templates!: Table<InterventionTemplate, Id>;
  activities!: Table<Activity, Id>;
  procedures!: Table<Procedure, Id>;
  userSettings!: Table<UserSettings, Id>;

  constructor() {
    super("workflow");

    // Indexes optimized for tablet workflows:
    // - fast lookup by clientId, dates
    // - stock movements by sparePartId
    this.version(1).stores({
      clients: "&id, name, updatedAt",
      interventions: "&id, clientId, startAt, updatedAt",
      spareParts: "&id, sku, name, updatedAt",
      stockMovements: "&id, sparePartId, createdAt, interventionId"
    });

    this.version(2).stores({
      clients: "&id, name, updatedAt",
      interventions: "&id, clientId, startAt, updatedAt",
      spareParts: "&id, sku, name, updatedAt",
      stockMovements: "&id, sparePartId, createdAt, interventionId",
      tickets: "&id, status, reminderAt, dueAt, updatedAt, clientId"
    });

    this.version(3).stores({
      clients: "&id, name, updatedAt",
      interventions: "&id, clientId, startAt, updatedAt, status, createdBy",
      spareParts: "&id, sku, name, updatedAt",
      stockMovements: "&id, sparePartId, createdAt, interventionId",
      tickets: "&id, status, reminderAt, dueAt, updatedAt, clientId",
      attachments: "&id, kind, createdAt"
    });

    this.version(4).stores({
      clients: "&id, name, updatedAt",
      interventions: "&id, clientId, startAt, updatedAt, status, createdBy",
      spareParts: "&id, sku, name, updatedAt",
      stockMovements: "&id, sparePartId, createdAt, interventionId",
      tickets: "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId",
      attachments: "&id, kind, createdAt"
    });

    this.version(5).stores({
      clients: "&id, name, updatedAt",
      interventions: "&id, clientId, startAt, updatedAt, status, createdBy",
      spareParts: "&id, sku, name, updatedAt",
      stockMovements: "&id, sparePartId, createdAt, interventionId",
      tickets: "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId",
      attachments: "&id, kind, createdAt"
    });

    this.version(6).stores({
      clients: "&id, name, updatedAt",
      interventions: "&id, clientId, startAt, updatedAt, status, createdBy, timerStartedAt",
      spareParts: "&id, sku, name, updatedAt",
      stockMovements: "&id, sparePartId, createdAt, interventionId",
      tickets: "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId",
      attachments: "&id, kind, createdAt"
    });

    this.version(7).stores({
      clients: "&id, name, updatedAt",
      interventions:
        "&id, clientId, startAt, updatedAt, status, createdBy, timerStartedAt",
      spareParts: "&id, sku, name, updatedAt",
      stockMovements: "&id, sparePartId, createdAt, interventionId",
      tickets: "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId",
      attachments: "&id, kind, createdAt, mime",
      documents: "&id, interventionId, createdAt, title"
    });

    this.version(8).stores({
      clients: "&id, name, updatedAt",
      interventions:
        "&id, clientId, startAt, updatedAt, status, createdBy, timerStartedAt",
      spareParts: "&id, sku, name, updatedAt",
      stockMovements: "&id, sparePartId, createdAt, interventionId",
      tickets: "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId",
      attachments: "&id, kind, createdAt, mime",
      documents: "&id, interventionId, createdAt, title",
      supportEmailOutbox:
        "&id, status, to, createdAt, updatedAt, documentId, interventionId"
    });

    this.version(9).stores({
      clients: "&id, name, updatedAt",
      interventions:
        "&id, clientId, startAt, updatedAt, status, createdBy, timerStartedAt",
      spareParts: "&id, sku, name, updatedAt",
      stockMovements: "&id, sparePartId, createdAt, interventionId",
      tickets: "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId",
      attachments: "&id, kind, createdAt, mime",
      documents: "&id, interventionId, createdAt, title",
      supportEmailOutbox:
        "&id, status, to, createdAt, updatedAt, documentId, interventionId",
      templates: "&id, name, updatedAt"
    });

    this.version(10).stores({
      clients: "&id, name, updatedAt",
      interventions:
        "&id, clientId, startAt, updatedAt, status, createdBy, timerStartedAt",
      spareParts: "&id, sku, name, updatedAt",
      stockMovements: "&id, sparePartId, createdAt, interventionId",
      tickets: "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId",
      attachments: "&id, kind, createdAt, mime",
      documents: "&id, interventionId, createdAt, title",
      supportEmailOutbox:
        "&id, status, to, createdAt, updatedAt, documentId, interventionId",
      templates: "&id, name, updatedAt"
    });

    // Cloud sync: indexed syncedAt for future dirty queries / maintenance.
    this.version(11).stores({
      clients: "&id, name, updatedAt, syncedAt",
      interventions:
        "&id, clientId, startAt, updatedAt, status, createdBy, timerStartedAt, syncedAt",
      spareParts: "&id, sku, name, updatedAt, syncedAt",
      stockMovements: "&id, sparePartId, createdAt, interventionId, syncedAt",
      tickets: "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId, syncedAt",
      attachments: "&id, kind, createdAt, mime, syncedAt",
      documents: "&id, interventionId, createdAt, title, syncedAt",
      supportEmailOutbox:
        "&id, status, to, createdAt, updatedAt, documentId, interventionId, syncedAt",
      templates: "&id, name, updatedAt, syncedAt"
    });

    this.version(12)
      .stores({
        clients: "&id, name, updatedAt, syncedAt",
        interventions:
          "&id, clientId, startAt, updatedAt, status, createdBy, timerStartedAt, workCategory, syncedAt",
        spareParts: "&id, sku, name, updatedAt, syncedAt",
        stockMovements: "&id, sparePartId, createdAt, interventionId, syncedAt",
        tickets:
          "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId, syncedAt",
        attachments: "&id, kind, createdAt, mime, syncedAt",
        documents: "&id, interventionId, createdAt, title, syncedAt",
        supportEmailOutbox:
          "&id, status, to, createdAt, updatedAt, documentId, interventionId, syncedAt",
        templates: "&id, name, updatedAt, workCategory, syncedAt"
      })
      .upgrade(async (tx) => {
        await tx
          .table("interventions")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.workCategory == null) row.workCategory = "intervention";
            if (row.isOfficeActivity == null) row.isOfficeActivity = false;
            if (typeof row.type !== "string" || !String(row.type).trim()) {
              row.type = "maintenance";
            }
          });
        await tx
          .table("templates")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.workCategory == null) row.workCategory = "intervention";
            if (row.isOfficeActivity == null) row.isOfficeActivity = false;
            if (typeof row.type !== "string" || !String(row.type).trim()) {
              row.type = "maintenance";
            }
          });
      });

    this.version(13)
      .stores({
        clients: "&id, name, updatedAt, syncedAt",
        interventions:
          "&id, clientId, startAt, updatedAt, status, createdBy, timerStartedAt, workCategory, dueAt, timerRunState, syncedAt",
        spareParts: "&id, sku, name, updatedAt, syncedAt",
        stockMovements: "&id, sparePartId, createdAt, interventionId, syncedAt",
        tickets:
          "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId, syncedAt",
        attachments: "&id, kind, createdAt, mime, syncedAt",
        documents: "&id, interventionId, createdAt, title, syncedAt",
        supportEmailOutbox:
          "&id, status, to, createdAt, updatedAt, documentId, interventionId, syncedAt",
        templates: "&id, name, updatedAt, workCategory, syncedAt"
      })
      .upgrade(async (tx) => {
        await tx
          .table("interventions")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.timerAccumulatedSeconds == null) row.timerAccumulatedSeconds = 0;
            if (row.timerRunState == null) {
              row.timerRunState = row.timerStartedAt ? "running" : "idle";
            }
            if (row.remindersEnabled == null) row.remindersEnabled = false;
          });
      });

    this.version(14)
      .stores({
        clients: "&id, name, updatedAt, syncedAt",
        interventions:
          "&id, clientId, startAt, updatedAt, status, createdBy, timerStartedAt, workCategory, dueAt, timerRunState, syncedAt",
        spareParts: "&id, sku, name, updatedAt, syncedAt",
        stockMovements: "&id, sparePartId, createdAt, interventionId, syncedAt",
        tickets:
          "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId, syncedAt",
        attachments: "&id, kind, createdAt, mime, syncedAt",
        documents: "&id, interventionId, createdAt, title, syncedAt",
        supportEmailOutbox:
          "&id, status, to, createdAt, updatedAt, documentId, interventionId, syncedAt",
        templates: "&id, name, updatedAt, workCategory, syncedAt"
      })
      .upgrade(async (tx) => {
        await tx
          .table("interventions")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            const s = row.status;
            if (s != null && s !== "open" && s !== "in_progress" && s !== "completed") {
              row.status = "open";
            }
            if ((row.status === "open" || row.status == null) && row.timerRunState === "running") {
              row.status = "in_progress";
            }
          });
      });

    this.version(15).stores({
      clients: "&id, name, updatedAt, syncedAt",
      interventions:
        "&id, clientId, startAt, updatedAt, status, createdBy, timerStartedAt, workCategory, dueAt, timerRunState, syncedAt",
      spareParts: "&id, sku, name, updatedAt, syncedAt",
      stockMovements: "&id, sparePartId, createdAt, interventionId, syncedAt",
      tickets:
        "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId, syncedAt",
      attachments: "&id, kind, createdAt, mime, syncedAt",
      documents: "&id, interventionId, createdAt, title, syncedAt",
      supportEmailOutbox:
        "&id, status, to, createdAt, updatedAt, documentId, interventionId, syncedAt",
      templates: "&id, name, updatedAt, workCategory, syncedAt"
    });

    this.version(16)
      .stores({
        clients: "&id, name, clientType, updatedAt, syncedAt",
        interventions:
          "&id, clientId, startAt, updatedAt, status, createdBy, timerStartedAt, workCategory, dueAt, timerRunState, syncedAt",
        spareParts: "&id, sku, name, updatedAt, syncedAt",
        stockMovements: "&id, sparePartId, createdAt, interventionId, syncedAt",
        tickets:
          "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId, syncedAt",
        attachments: "&id, kind, createdAt, mime, syncedAt",
        documents: "&id, interventionId, createdAt, title, syncedAt",
        supportEmailOutbox:
          "&id, status, to, createdAt, updatedAt, documentId, interventionId, syncedAt",
        templates: "&id, name, updatedAt, workCategory, syncedAt"
      })
      .upgrade(async (tx) => {
        await tx
          .table("clients")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.clientType == null) row.clientType = "other";
          });
      });

    // Add the Activities ("Attività") store — flexible personal task list.
    this.version(17).stores({
      clients: "&id, name, clientType, updatedAt, syncedAt",
      interventions:
        "&id, clientId, startAt, updatedAt, status, createdBy, timerStartedAt, workCategory, dueAt, timerRunState, syncedAt",
      spareParts: "&id, sku, name, updatedAt, syncedAt",
      stockMovements: "&id, sparePartId, createdAt, interventionId, syncedAt",
      tickets:
        "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId, syncedAt",
      attachments: "&id, kind, createdAt, mime, syncedAt",
      documents: "&id, interventionId, createdAt, title, syncedAt",
      supportEmailOutbox:
        "&id, status, to, createdAt, updatedAt, documentId, interventionId, syncedAt",
      templates: "&id, name, updatedAt, workCategory, syncedAt",
      activities: "&id, status, priority, dueAt, category, updatedAt, syncedAt"
    });

    // Add the Procedures & Troubleshooting store.
    this.version(18).stores({
      clients: "&id, name, clientType, updatedAt, syncedAt",
      interventions:
        "&id, clientId, startAt, updatedAt, status, createdBy, timerStartedAt, workCategory, dueAt, timerRunState, syncedAt",
      spareParts: "&id, sku, name, updatedAt, syncedAt",
      stockMovements: "&id, sparePartId, createdAt, interventionId, syncedAt",
      tickets:
        "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId, syncedAt",
      attachments: "&id, kind, createdAt, mime, syncedAt",
      documents: "&id, interventionId, createdAt, title, syncedAt",
      supportEmailOutbox:
        "&id, status, to, createdAt, updatedAt, documentId, interventionId, syncedAt",
      templates: "&id, name, updatedAt, workCategory, syncedAt",
      activities: "&id, status, priority, dueAt, category, updatedAt, syncedAt",
      procedures: "&id, category, brand, model, updatedAt, syncedAt"
    });

    this.version(19).stores({
      clients: "&id, name, clientType, updatedAt, syncedAt",
      interventions:
        "&id, clientId, startAt, updatedAt, status, createdBy, timerStartedAt, workCategory, dueAt, timerRunState, syncedAt",
      spareParts: "&id, sku, name, updatedAt, syncedAt",
      stockMovements: "&id, sparePartId, createdAt, interventionId, syncedAt",
      tickets:
        "&id, status, priority, reminderAt, dueAt, updatedAt, clientId, interventionId, syncedAt",
      attachments: "&id, kind, createdAt, mime, syncedAt",
      documents: "&id, interventionId, createdAt, title, syncedAt",
      supportEmailOutbox:
        "&id, status, to, createdAt, updatedAt, documentId, interventionId, syncedAt",
      templates: "&id, name, updatedAt, workCategory, syncedAt",
      activities: "&id, status, priority, dueAt, category, updatedAt, syncedAt",
      procedures: "&id, category, brand, model, updatedAt, syncedAt",
      userSettings: "&id, updatedAt, syncedAt"
    });
  }
}

/** Singleton app DB — import this rather than instantiating `WorkFlowDB` again. */
export const db = new WorkFlowDB();

