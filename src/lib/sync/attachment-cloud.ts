/**
 * Immediate attachment → Storage + wf_attachments (Section Sync 2).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attachment } from "@/lib/db/workflow-db";
import { db } from "@/lib/db/workflow-db";
import { buildAttachmentStoragePath, STORAGE_BUCKET } from "@/lib/sync/sync-constants";
import { pushSyncFailure } from "@/lib/sync/sync-failure-queue";
import { uploadToSupabaseStorageWithRetries } from "@/lib/sync/storage-upload";

export type AttachmentUploadCallbacks = {
  onProgress?: (pct: number) => void;
};

export async function persistAttachmentToCloud(
  supabase: SupabaseClient,
  userId: string,
  attachment: Attachment,
  callbacks?: AttachmentUploadCallbacks
): Promise<{ storagePath: string }> {
  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not signed in");

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) throw new Error("Supabase env missing");

    const storagePath = buildAttachmentStoragePath(
      userId,
      attachment.id,
      attachment.name
    );

    await uploadToSupabaseStorageWithRetries({
      supabaseUrl: url,
      anonKey,
      accessToken: session.access_token,
      bucket: STORAGE_BUCKET,
      objectPath: storagePath,
      body: attachment.blob,
      contentType: attachment.mime || "application/octet-stream",
      upsert: true,
      maxRetries: 3,
      onProgress: (p) => callbacks?.onProgress?.(p.percentage)
    });

    const nowIso = new Date().toISOString();
    const row = {
      id: attachment.id,
      user_id: userId,
      kind: attachment.kind,
      mime: attachment.mime,
      name: attachment.name ?? null,
      size: attachment.size ?? null,
      storage_path: storagePath,
      created_at: attachment.createdAt,
      updated_at: attachment.updatedAt ?? attachment.createdAt
    };

    const { error } = await supabase.from("wf_attachments").upsert(row, {
      onConflict: "id"
    });
    if (error) throw new Error(error.message);

    await db.attachments.update(attachment.id, {
      syncedAt: nowIso,
      updatedAt: nowIso,
      cloudStoragePath: storagePath
    });

    return { storagePath };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    pushSyncFailure({
      kind: "upload",
      title: "Attachment upload failed",
      detail
    });
    throw e;
  }
}
