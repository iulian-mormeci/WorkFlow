import Dexie, { type Table } from "dexie";

export type Id = string;

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
};

export type Intervention = {
  id: Id;
  clientId: Id;
  createdBy?: Id;
  type: "maintenance" | "repair" | "install" | "other";
  status?: "open" | "completed";
  startAt: string; // ISO
  endAt?: string; // ISO
  durationMinutes?: number;
  timerStartedAt?: string; // ISO - running timer start
  km?: number;
  notes?: string;
  photoIds?: Id[];
  documentIds?: Id[];
  voiceNoteIds?: Id[];
  checklist?: { id: Id; label: string; done: boolean }[];
  sparePartsUsed?: { sparePartId: Id; qty: number }[];
  createdAt: string;
  updatedAt: string;
};

export type SparePart = {
  id: Id;
  sku: string;
  name: string;
  unit?: string;
  minStock?: number;
  createdAt: string;
  updatedAt: string;
};

export type StockMovement = {
  id: Id;
  sparePartId: Id;
  type: "in" | "out" | "adjust";
  qty: number;
  reason?: string;
  interventionId?: Id;
  createdAt: string;
};

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
};

export type Attachment = {
  id: Id;
  kind: "photo" | "document" | "audio";
  mime: string;
  name?: string;
  size?: number;
  blob: Blob;
  createdAt: string;
};

export type Document = {
  id: Id;
  interventionId?: Id;
  title: string;
  attachmentId: Id; // PDF blob in attachments
  pageCount: number;
  createdAt: string;
};

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
};

export type InterventionTemplate = {
  id: Id;
  name: string;
  clientName?: string;
  type: Intervention["type"];
  km?: number;
  notes?: string;
  checklist?: { id: Id; label: string; done: boolean }[];
  sparePartsUsed?: { sparePartId: Id; qty: number }[];
  createdAt: string;
  updatedAt: string;
};

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
  }
}

export const db = new WorkFlowDB();

