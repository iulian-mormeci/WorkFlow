"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Save } from "lucide-react";
import {
  db,
  type InterventionTemplate,
  type SparePart,
  type WorkCategory
} from "@/lib/db/workflow-db";
import { JOB_TYPE_PRESETS } from "@/lib/interventions/job-types";
import { DynamicChecklistEditor, type ChecklistRow } from "@/components/checklist/dynamic-checklist-editor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type SpareLine = { sparePartId: string; qty: string };

function cloneChecklist(items?: ChecklistRow[]): ChecklistRow[] {
  if (!items?.length) return [];
  return items.map((x) => ({ ...x, id: crypto.randomUUID() }));
}

export type TemplateEditorTarget = {
  editId?: string | null;
  duplicateFromId?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: TemplateEditorTarget;
  onSaved?: () => void;
};

export function TemplateEditorDialog({ open, onOpenChange, target, onSaved }: Props) {
  const { toast } = useToast();
  const clients = useLiveQuery(async () => db.clients.orderBy("name").toArray(), []);
  const spareParts = useLiveQuery(async () => db.spareParts.orderBy("name").toArray(), []);

  const [name, setName] = useState("");
  const [jobType, setJobType] = useState("maintenance");
  const [workCategory, setWorkCategory] = useState<WorkCategory>("intervention");
  const [isOfficeActivity, setIsOfficeActivity] = useState(false);
  const [clientMode, setClientMode] = useState<"new" | "saved">("new");
  const [defaultClientId, setDefaultClientId] = useState("");
  const [clientNameHint, setClientNameHint] = useState("");
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState("");
  const [km, setKm] = useState("");
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [spareLines, setSpareLines] = useState<SpareLine[]>([]);
  const [saving, setSaving] = useState(false);

  const title = useMemo(() => {
    if (target.editId) return "Edit template";
    if (target.duplicateFromId) return "Duplicate template";
    return "New template";
  }, [target.duplicateFromId, target.editId]);

  function resetEmpty() {
    setName("");
    setJobType("maintenance");
    setWorkCategory("intervention");
    setIsOfficeActivity(false);
    setClientMode("new");
    setDefaultClientId("");
    setClientNameHint("");
    setDefaultDurationMinutes("");
    setKm("");
    setNotes("");
    setChecklist([]);
    setSpareLines([]);
  }

  function applyTemplate(t: InterventionTemplate, opts?: { nameOverride?: string }) {
    setName(opts?.nameOverride ?? t.name);
    setJobType(t.type || "maintenance");
    setWorkCategory(t.workCategory ?? "intervention");
    setIsOfficeActivity(Boolean(t.isOfficeActivity));
    if (t.defaultClientId) {
      setClientMode("saved");
      setDefaultClientId(t.defaultClientId);
      setClientNameHint("");
    } else {
      setClientMode("new");
      setDefaultClientId("");
      setClientNameHint(t.clientName ?? "");
    }
    setDefaultDurationMinutes(
      t.defaultDurationMinutes != null ? String(t.defaultDurationMinutes) : ""
    );
    setKm(t.km != null ? String(t.km) : "");
    setNotes(t.notes ?? "");
    setChecklist(cloneChecklist(t.checklist as ChecklistRow[] | undefined));
    setSpareLines(
      (t.sparePartsUsed ?? []).map((x) => ({
        sparePartId: x.sparePartId,
        qty: String(x.qty)
      }))
    );
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (target.editId) {
        const t = await db.templates.get(target.editId);
        if (cancelled || !t) {
          if (!cancelled && !t) {
            toast({ title: "Template not found", variant: "destructive" });
          }
          return;
        }
        applyTemplate(t);
        return;
      }
      if (target.duplicateFromId) {
        const t = await db.templates.get(target.duplicateFromId);
        if (cancelled || !t) {
          if (!cancelled && !t) {
            toast({ title: "Template not found", variant: "destructive" });
          }
          return;
        }
        applyTemplate(t, { nameOverride: `Copy of ${t.name}` });
        return;
      }
      resetEmpty();
    })();
    return () => {
      cancelled = true;
    };
  }, [open, target.duplicateFromId, target.editId, toast]);

  useEffect(() => {
    if (workCategory === "intervention") setIsOfficeActivity(false);
  }, [workCategory]);

  function addSpareLine() {
    setSpareLines((s) => [...s, { sparePartId: "", qty: "1" }]);
  }

  function updateSpareLine(i: number, patch: Partial<SpareLine>) {
    setSpareLines((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function removeSpareLine(i: number) {
    setSpareLines((rows) => rows.filter((_, j) => j !== i));
  }

  const canSave = name.trim().length > 2;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const dur = Number(defaultDurationMinutes);
      const sparePartsUsed = spareLines
        .filter((l) => l.sparePartId && Number(l.qty) > 0)
        .map((l) => ({ sparePartId: l.sparePartId, qty: Number(l.qty) }));

      const id = target.editId ?? crypto.randomUUID();
      const prev = target.editId ? await db.templates.get(target.editId) : null;

      const row: InterventionTemplate = {
        id,
        name: name.trim(),
        type: jobType.trim() || "maintenance",
        workCategory,
        isOfficeActivity: workCategory === "activity" ? isOfficeActivity : false,
        clientName:
          clientMode === "new" ? (clientNameHint.trim() || undefined) : undefined,
        defaultClientId:
          clientMode === "saved" && defaultClientId ? defaultClientId : undefined,
        defaultDurationMinutes:
          Number.isFinite(dur) && dur > 0 ? Math.round(dur) : undefined,
        km: km.trim() ? Number(km) : undefined,
        notes: notes.trim() || undefined,
        checklist: checklist.length ? checklist : undefined,
        sparePartsUsed: sparePartsUsed.length ? sparePartsUsed : undefined,
        createdAt: prev?.createdAt ?? nowIso,
        updatedAt: nowIso
      };

      if (target.editId) {
        await db.templates.put(row);
      } else {
        await db.templates.add(row);
      }

      toast({ title: "Template saved", description: row.name });
      onOpenChange(false);
      onSaved?.();
    } catch (e: unknown) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="max-h-[90dvh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Define defaults for new visits. Checklist and spare parts prefill the intervention form.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 grid gap-6">
            <div className="grid gap-2">
              <Label>Template name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Quarterly HVAC — downtown route"
                className="text-base"
              />
            </div>

            <div className="grid gap-2">
              <Label>Record as</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setWorkCategory("intervention")}
                  className={`rounded-2xl border-2 p-4 text-left transition ${
                    workCategory === "intervention"
                      ? "border-primary bg-primary/5"
                      : "border-muted bg-muted/30 hover:bg-muted/50"
                  }`}
                >
                  <div className="text-sm font-semibold">Field intervention</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    On-site client work, installs, repairs.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkCategory("activity")}
                  className={`rounded-2xl border-2 p-4 text-left transition ${
                    workCategory === "activity"
                      ? "border-primary bg-primary/5"
                      : "border-muted bg-muted/30 hover:bg-muted/50"
                  }`}
                >
                  <div className="text-sm font-semibold">Activity</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Office or remote work blocks.
                  </div>
                </button>
              </div>
            </div>

            {workCategory === "activity" ? (
              <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3">
                <Checkbox
                  id="tpl-office"
                  checked={isOfficeActivity}
                  onCheckedChange={(v) => setIsOfficeActivity(v === true)}
                />
                <Label htmlFor="tpl-office" className="cursor-pointer text-sm font-normal leading-snug">
                  On-site office activity (unchecked = remote / home office)
                </Label>
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label>Job type</Label>
              <Input
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                placeholder="Custom label"
                list="job-type-presets"
                className="text-base"
              />
              <datalist id="job-type-presets">
                {JOB_TYPE_PRESETS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>

            <div className="grid gap-3 rounded-2xl border bg-muted/30 p-4">
              <Label>Default client</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={clientMode === "new" ? "default" : "outline"}
                  size="lg"
                  className="min-h-11 flex-1"
                  onClick={() => setClientMode("new")}
                >
                  New client each time
                </Button>
                <Button
                  type="button"
                  variant={clientMode === "saved" ? "default" : "outline"}
                  size="lg"
                  className="min-h-11 flex-1"
                  onClick={() => setClientMode("saved")}
                >
                  Fixed client
                </Button>
              </div>
              {clientMode === "new" ? (
                <div className="grid gap-2">
                  <Label className="text-xs font-normal text-muted-foreground">
                    Optional suggested name (prefilled in the form)
                  </Label>
                  <Input
                    value={clientNameHint}
                    onChange={(e) => setClientNameHint(e.target.value)}
                    placeholder="e.g. New walk-in"
                    className="text-base"
                  />
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label className="text-xs font-normal text-muted-foreground">Client</Label>
                  <select
                    className="h-12 w-full rounded-xl border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    value={defaultClientId}
                    onChange={(e) => setDefaultClientId(e.target.value)}
                  >
                    <option value="">Select client…</option>
                    {(clients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Default duration (minutes)</Label>
                <Input
                  inputMode="numeric"
                  value={defaultDurationMinutes}
                  onChange={(e) => setDefaultDurationMinutes(e.target.value)}
                  placeholder="Optional"
                  className="text-base"
                />
              </div>
              <div className="grid gap-2">
                <Label>Default KM</Label>
                <Input
                  inputMode="numeric"
                  value={km}
                  onChange={(e) => setKm(e.target.value)}
                  placeholder="Optional"
                  className="text-base"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Default notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal checklist, access codes, special tools…"
                rows={4}
                className="text-base"
              />
            </div>

            <DynamicChecklistEditor value={checklist} onChange={setChecklist} label="Default checklist" />

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Default spare parts</Label>
                <Button type="button" variant="outline" size="sm" onClick={addSpareLine}>
                  <Plus className="h-4 w-4" />
                  Add line
                </Button>
              </div>
              {spareLines.length === 0 ? (
                <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No spare parts in this template.
                </div>
              ) : (
                <div className="grid gap-2">
                  {spareLines.map((line, idx) => {
                    const part: SparePart | undefined = spareParts?.find((p) => p.id === line.sparePartId);
                    return (
                      <div
                        key={idx}
                        className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_120px_auto] sm:items-center"
                      >
                        <select
                          className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                          value={line.sparePartId}
                          onChange={(e) => updateSpareLine(idx, { sparePartId: e.target.value })}
                        >
                          <option value="">Part…</option>
                          {(spareParts ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <Input
                          inputMode="numeric"
                          value={line.qty}
                          onChange={(e) => updateSpareLine(idx, { qty: e.target.value })}
                          placeholder="Qty"
                        />
                        <Button type="button" variant="ghost" onClick={() => removeSpareLine(idx)}>
                          Remove
                        </Button>
                        {part ? (
                          <div className="text-xs text-muted-foreground sm:col-span-3">
                            SKU {part.sku}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={!canSave || saving} onClick={save}>
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save template"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
