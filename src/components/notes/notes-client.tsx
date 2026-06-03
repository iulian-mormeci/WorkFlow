"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "@/i18n/navigation";
import { Mic, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { db, type Note } from "@/lib/db/workflow-db";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { performNoteCloudSyncDelete } from "@/lib/sync/cloud-delete";
import { NoteFormDialog } from "@/components/notes/note-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { procedureHtmlToText } from "@/lib/procedures/sanitize-html";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";

type FilterKey = "all" | "linked" | "personal";
type SortKey = "updated" | "created";

export function NotesClient() {
  const t = useTranslations("notes");
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState(false);

  const clients = useLiveQuery(() => db.clients.toArray(), [liveEpoch]);

  const notes = useLiveQuery(async () => {
    const all = await db.notes.orderBy("updatedAt").reverse().toArray();
    const qv = q.trim().toLowerCase();

    let list = all.filter((n) => {
      if (filter === "linked") {
        return Boolean(n.linkedInterventionId || n.linkedActivityId);
      }
      if (filter === "personal") {
        return !n.linkedInterventionId && !n.linkedActivityId;
      }
      return true;
    });

    if (qv) {
      list = list.filter((n) => {
        const plain = procedureHtmlToText(n.content ?? "").toLowerCase();
        return n.title.toLowerCase().includes(qv) || plain.includes(qv);
      });
    }

    list.sort((a, b) => {
      const ka = sort === "created" ? a.createdAt : a.updatedAt;
      const kb = sort === "created" ? b.createdAt : b.updatedAt;
      return kb.localeCompare(ka);
    });

    return list;
  }, [q, filter, sort, liveEpoch]);

  const clientNameById = useMemo(
    () => new Map((clients ?? []).map((c) => [c.id, c.name])),
    [clients]
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(n: Note) {
    setEditing(n);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await performNoteCloudSyncDelete({
        noteId: deleteTarget.id,
        voiceNoteIds: deleteTarget.voiceNoteIds ?? [],
        supabase,
        userId: null
      });
      if (!res.ok) {
        toast({
          title: t("toasts.deleteFailedTitle"),
          description: res.message,
          variant: "destructive"
        });
      } else {
        toast({ title: t("toasts.deletedTitle") });
      }
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const list = notes ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="min-h-11 pl-9"
          />
        </div>
        <Button size="lg" className="min-h-11 shrink-0 gap-2" onClick={openCreate}>
          <Plus className="h-5 w-5" />
          {t("actions.new")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "linked", "personal"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            className="min-h-10 touch-manipulation"
            onClick={() => setFilter(f)}
          >
            {t(`filters.${f}`)}
          </Button>
        ))}
        <select
          className="min-h-10 rounded-xl border bg-background px-3 text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label={t("sortLabel")}
        >
          <option value="updated">{t("sort.updated")}</option>
          <option value="created">{t("sort.created")}</option>
        </select>
      </div>

      <div className="grid gap-2.5 lg:grid-cols-2">
        {list.map((n) => {
          const preview = procedureHtmlToText(n.content ?? "").slice(0, 160);
          const linked =
            Boolean(n.linkedInterventionId) || Boolean(n.linkedActivityId);
          return (
            <div
              key={n.id}
              className="flex flex-col rounded-xl border bg-card p-3.5 shadow-sm transition hover:border-primary/30 hover:bg-muted/30 sm:p-4"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => openEdit(n)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-base font-semibold">{n.title}</span>
                  {linked ? (
                    <Badge className="border-transparent bg-secondary text-secondary-foreground">
                      {t("badges.linked")}
                    </Badge>
                  ) : (
                    <Badge className="border-muted-foreground/30 bg-muted/50 text-muted-foreground">
                      {t("badges.personal")}
                    </Badge>
                  )}
                  {(n.voiceNoteIds?.length ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Mic className="h-3.5 w-3.5" />
                      {n.voiceNoteIds!.length}
                    </span>
                  ) : null}
                </div>
                {n.linkedClientId ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("linkClient", { name: clientNameById.get(n.linkedClientId) ?? "—" })}
                  </p>
                ) : null}
                {preview ? (
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{preview}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("updatedAt", {
                    date: new Date(n.updatedAt).toLocaleString(undefined, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })
                  })}
                </p>
              </button>
              <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => openEdit(n)}>
                  <Pencil className="h-4 w-4" />
                  {t("actions.edit")}
                </Button>
                {n.linkedInterventionId ? (
                  <Button type="button" size="sm" variant="outline" className="min-h-10" asChild>
                    <Link href={`/interventions/${n.linkedInterventionId}`}>{t("actions.openIntervention")}</Link>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-10 text-destructive"
                  onClick={() => setDeleteTarget(n)}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("actions.delete")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : null}

      <NoteFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        note={editing}
        onSaved={() => setEditing(null)}
      />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(v) => !deleting && !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {deleteTarget ? t("deleteDialog.body", { title: deleteTarget.title }) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              {t("actions.cancel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? t("actions.deleting") : t("actions.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
