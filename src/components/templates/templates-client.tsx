"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Rocket, Trash2 } from "lucide-react";
import { db, type InterventionTemplate } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { InterventionFormDialog } from "@/components/interventions/intervention-form-dialog";
import { useToast } from "@/hooks/use-toast";

export function TemplatesClient() {
  const { toast } = useToast();
  const templates = useLiveQuery(async () => db.templates.orderBy("updatedAt").reverse().toArray(), []);
  const [createOpen, setCreateOpen] = useState(false);
  const [useOpen, setUseOpen] = useState(false);
  const [selected, setSelected] = useState<InterventionTemplate | null>(null);

  const [name, setName] = useState("");

  const canCreate = useMemo(() => name.trim().length > 2, [name]);

  async function createBlank() {
    const nowIso = new Date().toISOString();
    await db.templates.add({
      id: crypto.randomUUID(),
      name: name.trim(),
      type: "maintenance",
      createdAt: nowIso,
      updatedAt: nowIso
    });
    toast({ title: "Template created", description: "You can edit it later from an intervention." });
    setCreateOpen(false);
    setName("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {templates?.length ?? 0} templates
        </div>
        <Button size="lg" onClick={() => setCreateOpen(true)}>
          <Plus className="h-5 w-5" />
          New template
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b bg-muted px-4 py-3 text-sm font-medium">
          <div>Template</div>
          <div className="text-right">Actions</div>
        </div>
        <div className="divide-y">
          {(templates ?? []).map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-4">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">{t.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t.type} {t.clientName ? `• ${t.clientName}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelected(t);
                    setUseOpen(true);
                  }}
                >
                  <Rocket className="h-4 w-4" />
                  Use
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!confirm("Delete this template?")) return;
                    await db.templates.delete(t.id);
                    toast({ title: "Deleted", description: "Template removed." });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          ))}

          {(templates ?? []).length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No templates yet. Save a recurring job as a template for one-tap entry.
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New template</DialogTitle>
            <DialogDescription>Give it a name (you’ll fill fields later).</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly maintenance - Restaurant X" />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} type="button">
                Cancel
              </Button>
              <Button disabled={!canCreate} onClick={createBlank} type="button">
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <InterventionFormDialog
        open={useOpen}
        onOpenChange={setUseOpen}
        mode="new"
        initial={
          selected
            ? {
                clientName: selected.clientName,
                type: selected.type,
                km: selected.km,
                notes: selected.notes,
                checklist: (selected.checklist as any) ?? undefined,
                sparePartsUsed: (selected.sparePartsUsed as any) ?? undefined
              }
            : undefined
        }
      />
    </div>
  );
}

