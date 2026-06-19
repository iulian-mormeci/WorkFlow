"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Download,
  File,
  FileText,
  Folder,
  FolderPlus,
  History,
  Image,
  MoreVertical,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Share2,
  Trash2,
  TriangleAlert
} from "lucide-react";
import {
  listFiles,
  createFolder,
  deleteFile,
  renameFile,
  fetchBreadcrumbs,
  listFileAudit,
  type SharedFile,
  type FileAuditEntry
} from "@/lib/files/shared-files";
import { FileUploadZone } from "@/components/files/file-upload-zone";
import { ShareFileDialog } from "@/components/files/share-file-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mime, isFolder }: { mime: string | null; isFolder: boolean }) {
  if (isFolder) return <Folder className="h-5 w-5 text-amber-500" />;
  if (mime?.startsWith("image/")) return <Image className="h-5 w-5 text-blue-500" />;
  if (mime === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

function ScanBadge({ status }: { status: SharedFile["scanStatus"] }) {
  const t = useTranslations("files");
  if (status === "clean") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">
        <ShieldCheck className="h-3 w-3" />
        {t("scan.clean")}
      </span>
    );
  }
  if (status === "infected") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400">
        <ShieldAlert className="h-3 w-3" />
        {t("scan.infected")}
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
        <Shield className="h-3 w-3" />
        {t("scan.pending")}
      </span>
    );
  }
  return null; // skipped (folders) — no badge
}

type ContextMenu = {
  file: SharedFile;
  x: number;
  y: number;
};

export function FileBrowser() {
  const t = useTranslations("files");
  const { toast } = useToast();
  const userId = useAuthStore((s) => s.user?.id ?? "");

  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<SharedFile[]>([]);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [loading, setLoading] = useState(false);

  const [shareTarget, setShareTarget] = useState<SharedFile | null>(null);
  const [auditTarget, setAuditTarget] = useState<SharedFile | null>(null);
  const [auditEntries, setAuditEntries] = useState<FileAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [renameTarget, setRenameTarget] = useState<SharedFile | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SharedFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [items, crumbs] = await Promise.all([
        listFiles(userId, currentFolder),
        fetchBreadcrumbs(currentFolder)
      ]);
      setFiles(items);
      setBreadcrumbs(crumbs);
    } finally {
      setLoading(false);
    }
  }, [userId, currentFolder]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ctxMenu]);

  function openCtxMenu(e: React.MouseEvent, file: SharedFile) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ file, x: e.clientX, y: e.clientY });
  }

  function handleFileClick(file: SharedFile) {
    setCtxMenu(null);
    if (file.isFolder) {
      setCurrentFolder(file.id);
    } else if (file.scanStatus !== "infected") {
      window.open(`/api/files/${file.id}/download`, "_blank", "noopener,noreferrer");
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await createFolder(newFolderName, userId, currentFolder);
      setNewFolderOpen(false);
      setNewFolderName("");
      await refresh();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("folder.createError"), variant: "destructive" });
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleRename() {
    if (!renameTarget || !renameName.trim()) return;
    setRenaming(true);
    try {
      await renameFile(renameTarget.id, renameName, userId);
      setRenameTarget(null);
      await refresh();
    } finally {
      setRenaming(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteFile(deleteTarget.id, deleteTarget.storagePath);
      setDeleteTarget(null);
      toast({ title: t("delete.success") });
      await refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function openAudit(file: SharedFile) {
    setAuditTarget(file);
    setAuditLoading(true);
    try {
      const entries = await listFileAudit(file.id);
      setAuditEntries(entries);
    } finally {
      setAuditLoading(false);
    }
  }

  const isOwner = (f: SharedFile) => f.ownerId === userId;

  return (
    <div className="grid gap-4">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => setCurrentFolder(null)}
        >
          {t("root")}
        </button>
        {breadcrumbs.map((crumb) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              type="button"
              className="font-medium hover:underline"
              onClick={() => setCurrentFolder(crumb.id)}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-9 gap-1.5"
          onClick={() => { setNewFolderName(""); setNewFolderOpen(true); }}
        >
          <FolderPlus className="h-4 w-4" />
          {t("folder.newButton")}
        </Button>
      </div>

      {/* Upload zone */}
      <FileUploadZone
        userId={userId}
        parentId={currentFolder}
        onUploaded={refresh}
        onError={(msg) => toast({ title: msg, variant: "destructive" })}
      />

      {/* File list */}
      {loading ? (
        <div className="grid gap-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {files.map((file) => (
            <li
              key={file.id}
              className={cn(
                "flex items-center gap-3 px-4 py-3 transition-colors",
                file.scanStatus === "infected"
                  ? "bg-red-50/50 dark:bg-red-950/10"
                  : "hover:bg-muted/40 cursor-pointer"
              )}
              onClick={() => handleFileClick(file)}
            >
              <FileIcon mime={file.mime} isFolder={file.isFolder} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{file.name}</span>
                  {file.scanStatus === "infected" && (
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {!file.isFolder && <span>{formatBytes(file.size)}</span>}
                  <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                  {!file.isFolder && <ScanBadge status={file.scanStatus} />}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {!file.isFolder && file.scanStatus !== "infected" && (
                  <a
                    href={`/api/files/${file.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={t("actions.download")}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t("actions.more")}
                  onClick={(e) => openCtxMenu(e, file)}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={menuRef}
          className="fixed z-[200] min-w-44 rounded-xl border bg-background shadow-lg"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          {isOwner(ctxMenu.file) && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
              onClick={() => { setShareTarget(ctxMenu.file); setCtxMenu(null); }}
            >
              <Share2 className="h-4 w-4" /> {t("actions.share")}
            </button>
          )}
          {isOwner(ctxMenu.file) && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
              onClick={() => { openAudit(ctxMenu.file); setCtxMenu(null); }}
            >
              <History className="h-4 w-4" /> {t("actions.auditLog")}
            </button>
          )}
          {isOwner(ctxMenu.file) && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
              onClick={() => { setRenameName(ctxMenu.file.name); setRenameTarget(ctxMenu.file); setCtxMenu(null); }}
            >
              {t("actions.rename")}
            </button>
          )}
          {isOwner(ctxMenu.file) && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted"
              onClick={() => { setDeleteTarget(ctxMenu.file); setCtxMenu(null); }}
            >
              <Trash2 className="h-4 w-4" /> {t("actions.delete")}
            </button>
          )}
          {!isOwner(ctxMenu.file) && (
            <p className="px-3 py-2 text-xs text-muted-foreground">{t("actions.viewOnly")}</p>
          )}
        </div>
      )}

      {/* Share dialog */}
      {shareTarget && (
        <ShareFileDialog
          file={shareTarget}
          open={!!shareTarget}
          onOpenChange={(v) => { if (!v) setShareTarget(null); }}
        />
      )}

      {/* Audit log dialog */}
      <Dialog open={!!auditTarget} onOpenChange={(v) => { if (!v) setAuditTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("audit.title")}</DialogTitle>
          </DialogHeader>
          {auditLoading ? (
            <div className="space-y-2 py-4">
              {[...Array(4)].map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}
            </div>
          ) : auditEntries.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t("audit.empty")}</p>
          ) : (
            <ul className="max-h-80 divide-y overflow-y-auto rounded-xl border">
              {auditEntries.map((e) => (
                <li key={e.id} className="px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize">{e.action.replace("_", " ")}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {e.detail && Object.keys(e.detail).length > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {Object.entries(e.detail).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {/* New folder dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("folder.newTitle")}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t("folder.namePlaceholder")}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreateFolder(); }}
              className="min-h-11"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setNewFolderOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={!newFolderName.trim() || creatingFolder}
                onClick={() => void handleCreateFolder()}
              >
                {t("folder.createButton")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(v) => { if (!v) setRenameTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("actions.rename")}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Input
              autoFocus
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleRename(); }}
              className="min-h-11"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setRenameTarget(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={!renameName.trim() || renaming}
                onClick={() => void handleRename()}
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("delete.title")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("delete.confirm", { name: deleteTarget?.name ?? "" })}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {t("delete.button")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
