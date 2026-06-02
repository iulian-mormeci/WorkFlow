/**
 * Procedure image attachments: compress (downscale) picked images and persist them as
 * Dexie `attachments` rows (kind "photo"). The sync engine uploads the blob to Supabase
 * Storage and mirrors `wf_attachments`, exactly like intervention photos.
 */
import { db, type Attachment } from "@/lib/db/workflow-db";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}

/** Downscale large images to keep storage/bandwidth modest. Falls back to original on failure. */
async function compressImage(file: File): Promise<{ blob: Blob; mime: string }> {
  if (typeof document === "undefined" || !file.type.startsWith("image/")) {
    return { blob: file, mime: file.type || "application/octet-stream" };
  }
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return { blob: file, mime: file.type };
  }
  try {
    const img = await loadImage(file);
    const { width, height } = img;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    if (scale >= 1 && file.size <= 900_000) {
      return { blob: file, mime: file.type };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, mime: file.type };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const outMime = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), outMime, JPEG_QUALITY)
    );
    if (!blob) return { blob: file, mime: file.type };
    return { blob, mime: outMime };
  } catch {
    return { blob: file, mime: file.type || "application/octet-stream" };
  }
}

/** Compress + persist a single picked image, returning the new attachment id. */
export async function createProcedureImageAttachment(file: File): Promise<string> {
  const { blob, mime } = await compressImage(file);
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const baseName = (file.name || "image").replace(/\.[^.]+$/, "");
  const att: Attachment = {
    id,
    kind: "photo",
    mime: mime || "image/jpeg",
    name: `${baseName}.${ext}`,
    size: blob.size,
    blob,
    createdAt: nowIso,
    updatedAt: nowIso
  };
  await db.attachments.add(att);
  return id;
}
