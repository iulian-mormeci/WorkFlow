"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Copy,
  LayoutTemplate,
  Loader2,
  Pencil,
  Plus,
  Rocket,
  Trash2
} from "lucide-react";
import { db, type InterventionTemplate } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { InterventionFormDialog } from "@/components/interventions/intervention-form-dialog";
import {
  TemplateEditorDialog,
  type TemplateEditorTarget
} from "@/components/templates/template-editor-dialog";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { performTemplateCloudSyncDelete } from "@/lib/sync/cloud-delete";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";
import { useTranslations } from "next-intl";

function clientSubtitle(
  t: InterventionTemplate,
  clientNameById: Map<string, string>,
  tt: (key: string, values?: Record<string, any>) => string
): string {
  if (t.defaultClientId) {
    return clientNameById.get(t.defaultClientId) ?? tt("templates.card.savedClient");
  }
  if (t.clientName) return tt("templates.card.suggestedClient", { clientName: t.clientName });
  return tt("templates.card.newClientEachTime");
}

export function TemplatesClient() {
  const t = useTranslations();
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();
  const templates = useLiveQuery(
    async () => db.templates.orderBy("updatedAt").reverse().toArray(),
    [liveEpoch]
  );
  const clients = useLiveQuery(async () => db.clients.toArray(), [liveEpoch]);

  const clientNameById = useMemo(
    () => new Map((clients ?? []).map((c) => [c.id, c.name])),
    [clients]
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState<TemplateEditorTarget>({});

  const [useOpen, setUseOpen] = useState(false);
  const [selected, setSelected] = useState<InterventionTemplate | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<InterventionTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openCreate() {
    setEditorTarget({});
    setEditorOpen(true);
  }

  function openEdit(id: string) {
    setEditorTarget({ editId: id, duplicateFromId: null });
    setEditorOpen(true);
  }

  function openDuplicate(id: string) {
    setEditorTarget({ editId: null, duplicateFromId: id });
    setEditorOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
      const res = await performTemplateCloudSyncDelete({
        templateId: deleteTarget.id,
        supabase: supabase ?? null,
        userId: user?.id ?? null
      });
      if (!res.ok) {
        toast({
          title: t("templates.toasts.deleteFailedTitle"),
          description: res.message,
          variant: "destructive"
        });
        return;
      }
      toast({ title: t("templates.toasts.deletedTitle"), description: t("templates.toasts.deletedBody") });
      scheduleWorkflowSync();
      setDeleteTarget(null);
    } catch (e: unknown) {
      toast({
        title: t("templates.toasts.deleteFailedTitle"),
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive"
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LayoutTemplate className="h-4 w-4 shrink-0" />
          <span>{t("templates.count", { count: templates?.length ?? 0 })}</span>
        </div>
        <Button size="lg" className="min-h-12 w-full shrink-0 sm:w-auto" onClick={openCreate}>
          <Plus className="h-5 w-5" />
          {t("templates.actions.new")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(templates ?? []).map((tpl) => (
          <div
            key={tpl.id}
            className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition hover:border-primary/30 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="line-clamp-2 text-lg font-semibold leading-tight">{tpl.name}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge
                    className={
                      tpl.workCategory === "activity"
                        ? "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-200"
                        : "border-primary/30 bg-primary/10 text-primary"
                    }
                  >
                    {tpl.workCategory === "activity" ? t("common.activity") : t("common.intervention")}
                  </Badge>
                  <Badge className="border-muted-foreground/30 bg-background font-normal text-muted-foreground">
                    {tpl.type}
                  </Badge>
                </div>
              </div>
            </div>
            <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
              {clientSubtitle(tpl, clientNameById, t)}
            </p>
            {tpl.defaultDurationMinutes != null ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("templates.card.defaultDuration", { minutes: tpl.defaultDurationMinutes })}
              </p>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button
                type="button"
                variant="default"
                className="min-h-11"
                onClick={() => {
                  setSelected(tpl);
                  setUseOpen(true);
                }}
              >
                <Rocket className="h-4 w-4" />
                {t("templates.actions.createFromTemplate")}
              </Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => openEdit(tpl.id)}>
                <Pencil className="h-4 w-4" />
                {t("common.edit")}
              </Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => openDuplicate(tpl.id)}>
                <Copy className="h-4 w-4" />
                {t("templates.actions.duplicate")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteTarget(tpl)}
              >
                <Trash2 className="h-4 w-4" />
                {t("common.delete")}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {(templates ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/40 px-6 py-16 text-center">
          <p className="text-base font-medium text-foreground">{t("templates.empty.title")}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {t("templates.empty.body")}
          </p>
          <Button size="lg" className="mt-6" onClick={openCreate}>
            <Plus className="h-5 w-5" />
            {t("templates.empty.cta")}
          </Button>
        </div>
      ) : null}

      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        target={editorTarget}
        onSaved={() => {}}
      />

      <InterventionFormDialog
        open={useOpen}
        onOpenChange={setUseOpen}
        mode="new"
        initial={
          selected
            ? {
                clientName: selected.defaultClientId
                  ? clientNameById.get(selected.defaultClientId) ?? ""
                  : (selected.clientName ?? ""),
                defaultClientId: selected.defaultClientId ?? undefined,
                type: selected.type,
                workCategory: selected.workCategory,
                isOfficeActivity: selected.isOfficeActivity,
                km: selected.km,
                notes: selected.notes,
                checklist: selected.checklist?.map((x) => ({ ...x, id: crypto.randomUUID() })),
                sparePartsUsed: selected.sparePartsUsed,
                defaultDurationMinutes: selected.defaultDurationMinutes
              }
            : undefined
        }
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => !deleting && !v && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("templates.deleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {deleteTarget ? t("templates.deleteDialog.body", { name: deleteTarget.name }) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              className="gap-2"
              onClick={() => void confirmDelete()}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {deleting ? t("common.deleting") : t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
