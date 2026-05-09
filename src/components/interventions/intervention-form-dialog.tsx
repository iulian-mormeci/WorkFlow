"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Clock3,
  ListChecks,
  NotebookPen,
  Package,
  Plus,
  Save,
  TimerReset,
  Users
} from "lucide-react";
import { db, type Intervention, type SparePart } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "new" | "edit";
  interventionId?: string;
  onSaved?: (id: string) => void;
  initial?: Partial<{
    clientName: string;
    type: Intervention["type"];
    km: number;
    notes: string;
    checklist: ChecklistItem[];
    sparePartsUsed: { sparePartId: string; qty: number }[];
  }>;
};

type SparePartLine = { sparePartId: string; qty: string };
type ChecklistItem = { id: string; label: string; done: boolean };

const checklistTemplate: ChecklistItem[] = [
  { id: "power", label: "Power / cables checked", done: false },
  { id: "printer", label: "Printer test", done: false },
  { id: "network", label: "Network connection verified", done: false },
  { id: "closing", label: "Closing notes shared with client", done: false }
];

function toLocalDateTimeInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function computeDurationMinutes(startLocal: string, endLocal: string) {
  if (!startLocal || !endLocal) return undefined;
  const start = new Date(startLocal).getTime();
  const end = new Date(endLocal).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined;
  return Math.round((end - start) / 60000);
}

async function getOrCreateClientIdByName(nameRaw: string) {
  const nowIso = new Date().toISOString();
  const name = nameRaw.trim();
  const existing = await db.clients.where("name").equalsIgnoreCase(name).first();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.clients.add({ id, name, createdAt: nowIso, updatedAt: nowIso });
  return id;
}

async function computeStockByPartId(): Promise<Map<string, number>> {
  const moves = await db.stockMovements.toArray();
  const map = new Map<string, number>();
  for (const m of moves) {
    const prev = map.get(m.sparePartId) ?? 0;
    const delta = m.type === "out" ? -m.qty : m.qty; // adjust is stored as signed qty
    map.set(m.sparePartId, prev + delta);
  }
  return map;
}

export function InterventionFormDialog(props: Props) {
  const { open, onOpenChange, mode, interventionId, onSaved, initial } = props;

  const clients = useLiveQuery(async () => db.clients.orderBy("name").toArray(), []);
  const spareParts = useLiveQuery(async () => db.spareParts.orderBy("name").toArray(), []);

  const existing = useLiveQuery(async () => {
    if (mode !== "edit" || !interventionId) return null;
    return await db.interventions.get(interventionId);
  }, [mode, interventionId]);

  const [clientName, setClientName] = useState("");
  const [type, setType] = useState<Intervention["type"]>("maintenance");
  const [startAtLocal, setStartAtLocal] = useState("");
  const [endAtLocal, setEndAtLocal] = useState("");
  const [km, setKm] = useState("");
  const [notes, setNotes] = useState("");
  const [durationOverride, setDurationOverride] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(checklistTemplate);
  const [partsUsed, setPartsUsed] = useState<SparePartLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const durationMinutes = useMemo(
    () => {
      const manual = Number(durationOverride);
      if (Number.isFinite(manual) && manual > 0) return Math.round(manual);
      return computeDurationMinutes(startAtLocal, endAtLocal);
    },
    [startAtLocal, endAtLocal, durationOverride]
  );

  const canSave = useMemo(() => {
    return clientName.trim().length > 1 && Boolean(startAtLocal);
  }, [clientName, startAtLocal]);

  useEffect(() => {
    if (!open) return;
    setError(null);

    if (mode === "new") {
      const now = new Date();
      setClientName(initial?.clientName ?? "");
      setType(initial?.type ?? "maintenance");
      setStartAtLocal(toLocalDateTimeInputValue(now));
      setEndAtLocal("");
      setKm(initial?.km != null ? String(initial.km) : "");
      setNotes(initial?.notes ?? "");
      setDurationOverride("");
      setChecklist(initial?.checklist ?? checklistTemplate);
      setPartsUsed(
        (initial?.sparePartsUsed ?? []).map((x) => ({
          sparePartId: x.sparePartId,
          qty: String(x.qty)
        }))
      );
      return;
    }

    if (mode === "edit" && existing) {
      const now = new Date();
      const start = existing.startAt ? new Date(existing.startAt) : now;
      const end = existing.endAt ? new Date(existing.endAt) : null;

      const client = clients?.find((c) => c.id === existing.clientId);
      setClientName(client?.name ?? "");
      setType(existing.type);
      setStartAtLocal(toLocalDateTimeInputValue(start));
      setEndAtLocal(end ? toLocalDateTimeInputValue(end) : "");
      setKm(existing.km != null ? String(existing.km) : "");
      setNotes(existing.notes ?? "");
      setDurationOverride(existing.durationMinutes != null ? String(existing.durationMinutes) : "");
      setChecklist(existing.checklist ?? checklistTemplate);
      setPartsUsed(
        (existing.sparePartsUsed ?? []).map((x) => ({
          sparePartId: x.sparePartId,
          qty: String(x.qty)
        }))
      );
    }
  }, [
    open,
    mode,
    existing,
    clients,
    initial?.clientName,
    initial?.type,
    initial?.km,
    initial?.notes,
    initial?.checklist,
    initial?.sparePartsUsed
  ]);

  function setNow(which: "start" | "end") {
    const now = new Date();
    const v = toLocalDateTimeInputValue(now);
    if (which === "start") setStartAtLocal(v);
    else setEndAtLocal(v);
  }

  function addPartLine() {
    setPartsUsed((s) => [...s, { sparePartId: "", qty: "1" }]);
  }

  function removePartLine(idx: number) {
    setPartsUsed((s) => s.filter((_, i) => i !== idx));
  }

  function updatePartLine(idx: number, patch: Partial<SparePartLine>) {
    setPartsUsed((s) => s.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  function toggleChecklist(id: string) {
    setChecklist((s) => s.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  }

  async function save() {
    setError(null);
    if (!canSave) return;

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const clientId = await getOrCreateClientIdByName(clientName);

      const startIso = new Date(startAtLocal).toISOString();
      const endIso = endAtLocal ? new Date(endAtLocal).toISOString() : undefined;

      const sparePartsUsed = partsUsed
        .filter((l) => l.sparePartId && Number(l.qty) > 0)
        .map((l) => ({ sparePartId: l.sparePartId, qty: Number(l.qty) }));

      const existingPhotoIds =
        mode === "edit" && interventionId && existing?.photoIds?.length
          ? [...existing.photoIds]
          : undefined;

      const payload: Intervention = {
        id: mode === "edit" && interventionId ? interventionId : crypto.randomUUID(),
        clientId,
        type,
        status: endIso ? "completed" : "open",
        startAt: startIso,
        endAt: endIso,
        durationMinutes,
        km: km ? Number(km) : undefined,
        notes: notes.trim() || undefined,
        checklist,
        sparePartsUsed: sparePartsUsed.length ? sparePartsUsed : undefined,
        photoIds: existingPhotoIds,
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso
      };

      if (mode === "edit" && interventionId) {
        await db.interventions.put(payload);
      } else {
        await db.interventions.add(payload);
      }

      // Auto-create stock OUT movements for spare parts used (first usable version)
      if (sparePartsUsed.length) {
        for (const line of sparePartsUsed) {
          await db.stockMovements.add({
            id: crypto.randomUUID(),
            sparePartId: line.sparePartId,
            type: "out",
            qty: line.qty,
            reason: "Used in intervention",
            interventionId: payload.id,
            createdAt: nowIso
          });
        }
      }

      onOpenChange(false);
      onSaved?.(payload.id);
      toast({
        title: mode === "new" ? "Intervention saved" : "Intervention updated",
        description: "Saved locally (offline-first)."
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to save intervention");
      toast({
        title: "Save failed",
        description: e?.message ?? "Failed to save intervention",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }

  const stockByPartId = useLiveQuery(async () => await computeStockByPartId(), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{mode === "new" ? "New Intervention" : "Edit Intervention"}</DialogTitle>
          <DialogDescription>
            Offline-first. Everything saves locally and sync comes later.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid gap-5">
          {/* Client */}
          <div className="grid gap-2">
            <Label className="flex items-center gap-2">
              <Icon icon={Users} />
              Client
            </Label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Restaurant / Shop name"
              list="client-suggestions"
            />
            <datalist id="client-suggestions">
              {(clients ?? []).slice(0, 60).map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
            <div className="text-xs text-muted-foreground">
              If it doesn’t exist, it will be created automatically.
            </div>
          </div>

          {/* Type */}
          <div className="grid gap-2">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["maintenance", "repair", "install", "other"] as const).map((t) => (
                <Button
                  key={t}
                  variant={type === t ? "default" : "outline"}
                  onClick={() => setType(t)}
                  type="button"
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

          {/* Time */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Icon icon={Clock3} />
                  Start
                </Label>
                <Button variant="outline" size="sm" type="button" onClick={() => setNow("start")}>
                  <TimerReset className="h-4 w-4" />
                  Now
                </Button>
              </div>
              <Input type="datetime-local" value={startAtLocal} onChange={(e) => setStartAtLocal(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Icon icon={Clock3} />
                  End
                </Label>
                <Button variant="outline" size="sm" type="button" onClick={() => setNow("end")}>
                  <TimerReset className="h-4 w-4" />
                  Now
                </Button>
              </div>
              <Input type="datetime-local" value={endAtLocal} onChange={(e) => setEndAtLocal(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border bg-muted px-4 py-3 text-sm">
            <div className="text-muted-foreground">Auto duration</div>
            <div className="font-semibold">{durationMinutes != null ? `${durationMinutes} min` : "—"}</div>
          </div>

          <div className="grid gap-2">
            <Label>Duration override (minutes)</Label>
            <Input
              inputMode="numeric"
              value={durationOverride}
              onChange={(e) => setDurationOverride(e.target.value)}
              placeholder="Leave empty to auto-calc from start/end"
            />
            <div className="text-xs text-muted-foreground">
              Use this if you need to correct the calculated duration for CRM traceability.
            </div>
          </div>

          {/* KM + Notes */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>KM</Label>
              <Input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} placeholder="0" />
            </div>
            <div className="grid gap-2">
              <Label className="flex items-center gap-2">
                <Icon icon={NotebookPen} />
                Notes
              </Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was done, issues found…" />
            </div>
          </div>

          {/* Spare parts used */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Icon icon={Package} />
                Spare parts used
              </Label>
              <Button variant="outline" size="sm" type="button" onClick={addPartLine}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>

            {partsUsed.length === 0 ? (
              <div className="rounded-xl border bg-muted px-4 py-3 text-sm text-muted-foreground">
                No spare parts added.
              </div>
            ) : (
              <div className="grid gap-2">
                {partsUsed.map((line, idx) => {
                  const part: SparePart | undefined = spareParts?.find((p) => p.id === line.sparePartId);
                  const available = line.sparePartId ? stockByPartId?.get(line.sparePartId) ?? 0 : null;
                  return (
                    <div key={idx} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_140px_auto] sm:items-center">
                      <div className="grid gap-1">
                        <select
                          className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                          value={line.sparePartId}
                          onChange={(e) => updatePartLine(idx, { sparePartId: e.target.value })}
                        >
                          <option value="">Select spare part…</option>
                          {(spareParts ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku})
                            </option>
                          ))}
                        </select>
                        {part ? (
                          <div className="text-xs text-muted-foreground">
                            Available: {available ?? "—"} {part.unit ?? ""}
                          </div>
                        ) : null}
                      </div>

                      <Input
                        inputMode="numeric"
                        value={line.qty}
                        onChange={(e) => updatePartLine(idx, { qty: e.target.value })}
                        placeholder="Qty"
                      />

                      <Button variant="ghost" type="button" onClick={() => removePartLine(idx)}>
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Checklist */}
          <div className="grid gap-2">
            <Label className="flex items-center gap-2">
              <Icon icon={ListChecks} />
              Checklist
            </Label>
            <div className="grid gap-2 rounded-2xl border p-4">
              {checklist.map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <Checkbox
                    checked={item.done}
                    onCheckedChange={() => toggleChecklist(item.id)}
                  />
                  <div className="text-sm">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!canSave || saving} type="button" onClick={save}>
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

