import Dexie, { type Table } from "dexie";

export type Id = string;

/** Field work vs office / remote admin work (not the job category label in `type`). */
export type WorkCategory = "intervention" | "activity";

export type TimerRunState = "idle" | "running" | "paused";

export type ReminderPreset = "1d" | "2h" | "30m" | "custom";

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

export type Client = {
  id: Id;
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  vatNumber?: string;
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
  status?: "open" | "completed";
  startAt: string; // ISO
  endAt?: string; // ISO
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
  /** After a reminder fires once for the scheduled instant; cleared when due/preset changes in UI. */
  reminderLastFireAt?: string;
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

export type Ticket = {
  id: Id;
  title: string;
  description?: string;
  clientId?: Id;
  interventionId?: Id;
  priority: "low" | "medium" | "high";
  status: "open" | "pending" | "closed";
  reminderAt?: string; // ISO
  dueAt?: string; // ISO
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
  }
}

export const db = new WorkFlowDB();

