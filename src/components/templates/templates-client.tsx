"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Copy,
  LayoutTemplate,
  Pencil,
  Plus,
  Rocket,
  Trash2
} from "lucide-react";
import { db, type InterventionTemplate } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function clientSubtitle(
  t: InterventionTemplate,
  clientNameById: Map<string, string>
): string {
  if (t.defaultClientId) {
    return clientNameById.get(t.defaultClientId) ?? "Saved client";
  }
  if (t.clientName) return `Suggested: ${t.clientName}`;
  return "New client each time";
}

export function TemplatesClient() {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LayoutTemplate className="h-4 w-4 shrink-0" />
          <span>{templates?.length ?? 0} templates</span>
        </div>
        <Button size="lg" className="min-h-12 w-full shrink-0 sm:w-auto" onClick={openCreate}>
          <Plus className="h-5 w-5" />
          New template
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(templates ?? []).map((t) => (
          <div
            key={t.id}
            className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition hover:border-primary/30 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="line-clamp-2 text-lg font-semibold leading-tight">{t.name}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge
                    className={
                      t.workCategory === "activity"
                        ? "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-200"
                        : "border-primary/30 bg-primary/10 text-primary"
                    }
                  >
                    {t.workCategory === "activity" ? "Activity" : "Intervention"}
                  </Badge>
                  <Badge className="border-muted-foreground/30 bg-background font-normal text-muted-foreground">
                    {t.type}
                  </Badge>
                </div>
              </div>
            </div>
            <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{clientSubtitle(t, clientNameById)}</p>
            {t.defaultDurationMinutes != null ? (
              <p className="mt-1 text-xs text-muted-foreground">Default duration · {t.defaultDurationMinutes} min</p>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button
                type="button"
                variant="default"
                className="min-h-11"
                onClick={() => {
                  setSelected(t);
                  setUseOpen(true);
                }}
              >
                <Rocket className="h-4 w-4" />
                Create from template
              </Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => openEdit(t.id)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => openDuplicate(t.id)}>
                <Copy className="h-4 w-4" />
                Duplicate
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={async () => {
                  if (
                    !confirm(
                      "Delete this template from this device and from the cloud when online?"
                    )
                  ) {
                    return;
                  }
                  try {
                    const supabase = createSupabaseBrowserClient();
                    const {
                      data: { user }
                    } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
                    const res = await performTemplateCloudSyncDelete({
                      templateId: t.id,
                      supabase: supabase ?? null,
                      userId: user?.id ?? null
                    });
                    if (!res.ok) {
                      toast({
                        title: "Delete failed",
                        description: res.message,
                        variant: "destructive"
                      });
                      return;
                    }
                    toast({ title: "Deleted", description: "Template removed." });
                    scheduleWorkflowSync();
                  } catch (e: unknown) {
                    toast({
                      title: "Delete failed",
                      description: e instanceof Error ? e.message : String(e),
                      variant: "destructive"
                    });
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      {(templates ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/40 px-6 py-16 text-center">
          <p className="text-base font-medium text-foreground">No templates yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Build a library of recurring visits with checklist, spare parts, and client defaults. Tap
            &quot;New template&quot; to start.
          </p>
          <Button size="lg" className="mt-6" onClick={openCreate}>
            <Plus className="h-5 w-5" />
            Create your first template
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
    </div>
  );
}
