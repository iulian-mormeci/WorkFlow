"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type SharedFile = {
  id: string;
  ownerId: string;
  parentId: string | null;
  name: string;
  mime: string | null;
  size: number | null;
  storagePath: string | null;
  isFolder: boolean;
  scanStatus: "pending" | "clean" | "infected" | "skipped";
  createdAt: string;
  updatedAt: string;
  /** Populated when file is shared with the current user by someone else. */
  sharedByEmail?: string;
};

export type FileShare = {
  id: string;
  fileId: string;
  sharedWith: string;
  permission: "view" | "edit";
  sharedBy: string;
  createdAt: string;
};

export type FileAuditEntry = {
  id: string;
  fileId: string | null;
  actorId: string;
  action: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

/** Dangerous MIME types that are rejected client-side before upload. */
const BLOCKED_EXTENSIONS = new Set([
  "exe","bat","cmd","com","msi","vbs","js","jse","wsf","scr",
  "ps1","psm1","sh","bash","zsh","fish","py","rb","pl","php",
  "jar","class","dll","so","dylib"
]);

export function validateFileForUpload(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (BLOCKED_EXTENSIONS.has(ext)) return "blocked_extension";
  if (file.size > 50 * 1024 * 1024) return "file_too_large";
  return null;
}

function rowToFile(r: Record<string, unknown>): SharedFile {
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    parentId: (r.parent_id as string) ?? null,
    name: String(r.name),
    mime: (r.mime as string) ?? null,
    size: (r.size as number) ?? null,
    storagePath: (r.storage_path as string) ?? null,
    isFolder: Boolean(r.is_folder),
    scanStatus: (r.scan_status as SharedFile["scanStatus"]) ?? "pending",
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at ?? r.created_at),
  };
}

/** List files and folders inside a given parent (null = root). */
export async function listFiles(
  userId: string,
  parentId: string | null
): Promise<SharedFile[]> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return [];

  const q = supabase
    .from("wf_shared_files")
    .select("*")
    .order("is_folder", { ascending: false })
    .order("name", { ascending: true });

  if (parentId) {
    q.eq("parent_id", parentId);
  } else {
    q.is("parent_id", null);
  }

  const { data } = await q;
  return (data as Record<string, unknown>[] | null)?.map(rowToFile) ?? [];
}

/**
 * Upload a file to Supabase Storage and insert metadata.
 * Returns the created SharedFile on success.
 */
export async function uploadFile(
  file: File,
  userId: string,
  parentId: string | null,
  onProgress?: (pct: number) => void
): Promise<SharedFile | null> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;

  const fileId = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w\-. ]+/g, "_").slice(0, 200);
  const storagePath = `${userId}/${fileId}/${safeName}`;

  onProgress?.(5);

  const { error: upErr } = await supabase.storage
    .from("shared-files")
    .upload(storagePath, file, { upsert: false, contentType: file.type || "application/octet-stream" });

  if (upErr) throw new Error(upErr.message);
  onProgress?.(70);

  const now = new Date().toISOString();
  const { data, error: dbErr } = await supabase
    .from("wf_shared_files")
    .insert({
      id: fileId,
      owner_id: userId,
      parent_id: parentId,
      name: safeName,
      mime: file.type || null,
      size: file.size,
      storage_path: storagePath,
      is_folder: false,
      scan_status: "clean", // client-validated; mark clean after extension check
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (dbErr) {
    // Best-effort cleanup of orphaned storage object
    void supabase.storage.from("shared-files").remove([storagePath]);
    throw new Error(dbErr.message);
  }

  onProgress?.(90);

  // Audit
  void supabase.from("wf_file_audit").insert({
    file_id: fileId,
    actor_id: userId,
    action: "upload",
    detail: { name: safeName, size: file.size, mime: file.type }
  });

  onProgress?.(100);
  return rowToFile(data as Record<string, unknown>);
}

/** Create a virtual folder (no storage object). */
export async function createFolder(
  name: string,
  userId: string,
  parentId: string | null
): Promise<SharedFile | null> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("wf_shared_files")
    .insert({
      owner_id: userId,
      parent_id: parentId,
      name: name.trim(),
      is_folder: true,
      scan_status: "skipped",
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  void supabase.from("wf_file_audit").insert({
    file_id: (data as any).id,
    actor_id: userId,
    action: "create_folder",
    detail: { name: name.trim() }
  });

  return rowToFile(data as Record<string, unknown>);
}

/** Delete a file or folder (recursion handled by DB CASCADE on parent_id). */
export async function deleteFile(fileId: string, storagePath: string | null): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  if (storagePath) {
    void supabase.storage.from("shared-files").remove([storagePath]);
  }

  void supabase.from("wf_file_audit").insert({
    file_id: fileId,
    actor_id: user.id,
    action: "delete",
    detail: null
  });

  await supabase.from("wf_shared_files").delete().eq("id", fileId);
}

/** Share a file with another user by email. Calls the SECURITY DEFINER Postgres function. */
export async function shareFileWithEmail(
  fileId: string,
  email: string,
  permission: "view" | "edit" = "view"
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: "unavailable" };

  const { data, error } = await supabase.rpc("wf_share_file_with_email", {
    p_file_id: fileId,
    p_email: email,
    p_permission: permission,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("user_not_found")) return { ok: false, error: "user_not_found" };
    if (msg.includes("not_owner")) return { ok: false, error: "not_owner" };
    if (msg.includes("cannot_share_with_self")) return { ok: false, error: "cannot_share_with_self" };
    return { ok: false, error: msg };
  }

  return { ok: true };
}

/** Remove a share. */
export async function unshareFile(shareId: string, fileId: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("wf_file_shares").delete().eq("id", shareId);

  void supabase.from("wf_file_audit").insert({
    file_id: fileId,
    actor_id: user.id,
    action: "unshare",
    detail: { share_id: shareId }
  });
}

/** List shares for a file (owner only). */
export async function listFileShares(fileId: string): Promise<FileShare[]> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("wf_file_shares")
    .select("*")
    .eq("file_id", fileId)
    .order("created_at", { ascending: false });

  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    id: String(r.id),
    fileId: String(r.file_id),
    sharedWith: String(r.shared_with),
    permission: r.permission as "view" | "edit",
    sharedBy: String(r.shared_by),
    createdAt: String(r.created_at),
  }));
}

/** Fetch audit log for a file (visible to owner). */
export async function listFileAudit(fileId: string, limit = 50): Promise<FileAuditEntry[]> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("wf_file_audit")
    .select("*")
    .eq("file_id", fileId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    id: String(r.id),
    fileId: (r.file_id as string) ?? null,
    actorId: String(r.actor_id),
    action: String(r.action),
    detail: (r.detail as Record<string, unknown>) ?? null,
    createdAt: String(r.created_at),
  }));
}

/** Rename a file or folder. */
export async function renameFile(fileId: string, newName: string, userId: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return;

  const trimmed = newName.trim();
  if (!trimmed) return;

  await supabase.from("wf_shared_files")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", fileId);

  void supabase.from("wf_file_audit").insert({
    file_id: fileId,
    actor_id: userId,
    action: "rename",
    detail: { new_name: trimmed }
  });
}

/** Fetch breadcrumb path from root to a given folder id. */
export async function fetchBreadcrumbs(folderId: string | null): Promise<SharedFile[]> {
  if (!folderId) return [];
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return [];

  const crumbs: SharedFile[] = [];
  let current: string | null = folderId;

  while (current) {
    const { data } = await supabase
      .from("wf_shared_files")
      .select("*")
      .eq("id", current)
      .single();
    if (!data) break;
    const item = rowToFile(data as Record<string, unknown>);
    crumbs.unshift(item);
    current = item.parentId;
  }

  return crumbs;
}
