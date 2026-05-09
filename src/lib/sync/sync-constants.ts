export const STORAGE_BUCKET = "attachments";

/** Object key layout: `{userId}/{attachmentId}-{safeFileName}` (Section Sync 2). */
export function buildAttachmentStoragePath(
  userId: string,
  attachmentId: string,
  fileName?: string
): string {
  const raw = (fileName?.trim() || "file")
    .replace(/[/\\?#]+/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  const safe = raw.length ? raw : "file";
  return `${userId}/${attachmentId}-${safe}`;
}

/** Legacy keys from Sync 1 (id-only suffix). */
export function legacyAttachmentStoragePath(userId: string, attachmentId: string): string {
  return `${userId}/${attachmentId}`;
}
