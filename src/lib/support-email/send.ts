"use client";

import { db, type SupportEmailOutboxItem } from "@/lib/db/workflow-db";

export async function queueSupportEmail(input: Omit<SupportEmailOutboxItem, "status" | "createdAt" | "updatedAt">) {
  const nowIso = new Date().toISOString();
  const item: SupportEmailOutboxItem = {
    ...input,
    status: "queued",
    createdAt: nowIso,
    updatedAt: nowIso
  };
  await db.supportEmailOutbox.add(item);
  return item.id;
}

async function postSupportEmail(params: {
  to: string;
  title: string;
  note?: string;
  attachmentId: string;
}) {
  const a = await db.attachments.get(params.attachmentId);
  if (!a) throw new Error("PDF attachment not found");

  const fd = new FormData();
  fd.append("to", params.to);
  fd.append("title", params.title);
  if (params.note) fd.append("note", params.note);
  fd.append(
    "file",
    new File([a.blob], a.name ?? "document.pdf", { type: "application/pdf" })
  );

  const res = await fetch("/api/support-email", { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
}

export async function flushSupportEmailOutbox() {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const items = await db.supportEmailOutbox
    .where("status")
    .equals("queued")
    .sortBy("createdAt");

  for (const item of items) {
    const nowIso = new Date().toISOString();
    await db.supportEmailOutbox.update(item.id, { status: "sending", updatedAt: nowIso });
    try {
      await postSupportEmail({
        to: item.to,
        title: item.title,
        note: item.note,
        attachmentId: item.attachmentId
      });
      await db.supportEmailOutbox.update(item.id, { status: "sent", lastError: undefined, updatedAt: new Date().toISOString() });
    } catch (e: any) {
      await db.supportEmailOutbox.update(item.id, {
        status: "error",
        lastError: e?.message ?? String(e),
        updatedAt: new Date().toISOString()
      });
    }
  }
}

