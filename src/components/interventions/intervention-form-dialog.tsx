"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Bell,
  Clock3,
  ListChecks,
  NotebookPen,
  Package,
  Plus,
  Save,
  TimerReset,
  Users
} from "lucide-react";
import { DynamicChecklistEditor, type ChecklistRow } from "@/components/checklist/dynamic-checklist-editor";
import { InterventionLocationFields } from "@/components/interventions/intervention-location-fields";
import { JOB_TYPE_PRESETS } from "@/lib/interventions/job-types";
import { preservedWorkflowStatus } from "@/lib/interventions/intervention-helpers";
import {
  db,
  type Intervention,
  type InterventionGeoStop,
  type ReminderPreset,
  type SparePart,
  type WorkCategory
} from "@/lib/db/workflow-db";
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
    defaultClientId?: string | null;
    type: string;
    workCategory?: WorkCategory;
    isOfficeActivity?: boolean;
    km: number;
    notes: string;
    checklist: ChecklistRow[];
    sparePartsUsed: { sparePartId: string; qty: number }[];
    defaultDurationMinutes?: number;
  }>;
};

type SparePartLine = { sparePartId: string; qty: string };

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
  const [type, setType] = useState("maintenance");
  const [workCategory, setWorkCategory] = useState<WorkCategory>("intervention");
  const [isOfficeActivity, setIsOfficeActivity] = useState(false);
  const [startAtLocal, setStartAtLocal] = useState("");
  const [endAtLocal, setEndAtLocal] = useState("");
  const [km, setKm] = useState("");
  const [notes, setNotes] = useState("");
  const [durationOverride, setDurationOverride] = useState("");
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [partsUsed, setPartsUsed] = useState<SparePartLine[]>([]);
  const [dueAtLocal, setDueAtLocal] = useState("");
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderPreset, setReminderPreset] = useState<ReminderPreset>("2h");
  const [reminderCustomAtLocal, setReminderCustomAtLocal] = useState("");
  const [reminderEmailTo, setReminderEmailTo] = useState("");
  const [startLocation, setStartLocation] = useState<InterventionGeoStop | undefined>();
  const [endLocation, setEndLocation] = useState<InterventionGeoStop | undefined>();
  const [locationKmAuto, setLocationKmAuto] = useState<number | undefined>();
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
      setWorkCategory(initial?.workCategory ?? "intervention");
      setIsOfficeActivity(initial?.isOfficeActivity ?? false);
      setStartAtLocal(toLocalDateTimeInputValue(now));
      setEndAtLocal("");
      setKm(initial?.km != null ? String(initial.km) : "");
      setNotes(initial?.notes ?? "");
      setDurationOverride(
        initial?.defaultDurationMinutes != null ? String(initial.defaultDurationMinutes) : ""
      );
      setChecklist(initial?.checklist?.length ? [...initial.checklist] : []);
      setPartsUsed(
        (initial?.sparePartsUsed ?? []).map((x) => ({
          sparePartId: x.sparePartId,
          qty: String(x.qty)
        }))
      );
      setDueAtLocal("");
      setRemindersEnabled(false);
      setReminderPreset("2h");
      setReminderCustomAtLocal("");
      setReminderEmailTo("");
      setStartLocation(undefined);
      setEndLocation(undefined);
      setLocationKmAuto(undefined);
      return;
    }

    if (mode === "edit" && existing) {
      const now = new Date();
      const start = existing.startAt ? new Date(existing.startAt) : now;
      const end = existing.endAt ? new Date(existing.endAt) : null;

      const client = clients?.find((c) => c.id === existing.clientId);
      setClientName(client?.name ?? "");
      setType(existing.type ?? "maintenance");
      setWorkCategory(existing.workCategory ?? "intervention");
      setIsOfficeActivity(existing.isOfficeActivity ?? false);
      setStartAtLocal(toLocalDateTimeInputValue(start));
      setEndAtLocal(end ? toLocalDateTimeInputValue(end) : "");
      setKm(existing.km != null ? String(existing.km) : "");
      setNotes(existing.notes ?? "");
      setDurationOverride(existing.durationMinutes != null ? String(existing.durationMinutes) : "");
      setChecklist(existing.checklist?.length ? [...existing.checklist] : []);
      setPartsUsed(
        (existing.sparePartsUsed ?? []).map((x) => ({
          sparePartId: x.sparePartId,
          qty: String(x.qty)
        }))
      );
      setDueAtLocal(existing.dueAt ? toLocalDateTimeInputValue(new Date(existing.dueAt)) : "");
      setRemindersEnabled(Boolean(existing.remindersEnabled));
      setReminderPreset(existing.reminderPreset ?? "2h");
      setReminderCustomAtLocal(
        existing.reminderCustomAt
          ? toLocalDateTimeInputValue(new Date(existing.reminderCustomAt))
          : ""
      );
      setReminderEmailTo(existing.reminderEmailTo ?? "");
      setStartLocation(existing.startLocation);
      setEndLocation(existing.endLocation);
      setLocationKmAuto(existing.locationKmAuto);
    }
  }, [
    open,
    mode,
    existing,
    clients,
    initial?.clientName,
    initial?.type,
    initial?.workCategory,
    initial?.isOfficeActivity,
    initial?.km,
    initial?.notes,
    initial?.checklist,
    initial?.sparePartsUsed,
    initial?.defaultDurationMinutes
  ]);

  useEffect(() => {
    if (!open || mode !== "new") return;
    const cid = initial?.defaultClientId;
    if (!cid) return;
    let cancelled = false;
    (async () => {
      const cl = await db.clients.get(cid);
      if (cancelled || !cl) return;
      setClientName(cl.name);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, initial?.defaultClientId]);

  useEffect(() => {
    if (workCategory === "intervention") setIsOfficeActivity(false);
  }, [workCategory]);

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

  async function save() {
    setError(null);
    if (!canSave) return;
    if (mode === "edit" && (!interventionId || !existing)) {
      toast({
        title: "Still loading",
        description: "Wait for the intervention to load, then try again.",
        variant: "destructive"
      });
      return;
    }

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

      const dueIso = dueAtLocal ? new Date(dueAtLocal).toISOString() : undefined;
      const reminderCustomIso =
        remindersEnabled && reminderPreset === "custom" && reminderCustomAtLocal
          ? new Date(reminderCustomAtLocal).toISOString()
          : undefined;
      const nextReminderEmail = remindersEnabled ? reminderEmailTo.trim() || undefined : undefined;
      const nextPreset = remindersEnabled ? reminderPreset : undefined;

      const reminderConfigChanged =
        mode === "edit" &&
        existing &&
        (dueIso !== existing.dueAt ||
          remindersEnabled !== !!existing.remindersEnabled ||
          (nextPreset ?? null) !== (existing.reminderPreset ?? null) ||
          (reminderCustomIso ?? null) !== (existing.reminderCustomAt ?? null) ||
          (nextReminderEmail ?? "") !== (existing.reminderEmailTo ?? ""));

      let savedId = "";
      if (mode === "edit" && interventionId && existing) {
        const payload: Intervention = {
          ...existing,
          clientId,
          type: type.trim() || "maintenance",
          workCategory,
          isOfficeActivity: workCategory === "activity" ? isOfficeActivity : false,
          status: preservedWorkflowStatus(existing),
          startAt: startIso,
          endAt: endIso,
          durationMinutes,
          km: km ? Number(km) : undefined,
          notes: notes.trim() || undefined,
          checklist: checklist.length ? checklist : undefined,
          sparePartsUsed: sparePartsUsed.length ? sparePartsUsed : undefined,
          photoIds: existingPhotoIds ?? existing.photoIds,
          dueAt: dueIso,
          remindersEnabled,
          reminderPreset: nextPreset,
          reminderCustomAt:
            remindersEnabled && reminderPreset === "custom" ? reminderCustomIso : undefined,
          reminderEmailTo: nextReminderEmail,
          reminderLastFireAt: reminderConfigChanged ? undefined : existing.reminderLastFireAt,
          reminderPreDueAckAt: reminderConfigChanged ? undefined : existing.reminderPreDueAckAt,
          reminderDueAckAt: reminderConfigChanged ? undefined : existing.reminderDueAckAt,
          startLocation,
          endLocation,
          locationKmAuto,
          updatedAt: nowIso
        };
        await db.interventions.put(payload);
        savedId = payload.id;
      } else {
        const payload: Intervention = {
          id: crypto.randomUUID(),
          clientId,
          type: type.trim() || "maintenance",
          workCategory,
          isOfficeActivity: workCategory === "activity" ? isOfficeActivity : false,
          status: "open",
          startAt: startIso,
          endAt: endIso,
          durationMinutes,
          timerRunState: "idle",
          timerAccumulatedSeconds: 0,
          timerStartedAt: undefined,
          km: km ? Number(km) : undefined,
          notes: notes.trim() || undefined,
          checklist: checklist.length ? checklist : undefined,
          sparePartsUsed: sparePartsUsed.length ? sparePartsUsed : undefined,
          photoIds: existingPhotoIds,
          dueAt: dueIso,
          remindersEnabled,
          reminderPreset: nextPreset,
          reminderCustomAt:
            remindersEnabled && reminderPreset === "custom" ? reminderCustomIso : undefined,
          reminderEmailTo: nextReminderEmail,
          startLocation,
          endLocation,
          locationKmAuto,
          createdAt: nowIso,
          updatedAt: nowIso
        };
        await db.interventions.add(payload);
        savedId = payload.id;
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
            interventionId: savedId,
            createdAt: nowIso
          });
        }
      }

      onOpenChange(false);
      onSaved?.(savedId);
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

          {/* Intervention vs activity */}
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
                <div className="text-sm font-semibold">Intervention</div>
                <div className="mt-1 text-xs text-muted-foreground">Field visit at a client.</div>
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
                <div className="mt-1 text-xs text-muted-foreground">Office or remote work.</div>
              </button>
            </div>
          </div>

          {workCategory === "activity" ? (
            <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3">
              <Checkbox
                id="iv-office"
                checked={isOfficeActivity}
                onCheckedChange={(v) => setIsOfficeActivity(v === true)}
              />
              <Label htmlFor="iv-office" className="cursor-pointer text-sm font-normal leading-snug">
                On-site office (unchecked = remote)
              </Label>
            </div>
          ) : null}

          {/* Job type (free text) */}
          <div className="grid gap-2">
            <Label>Job type</Label>
            <Input
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="e.g. maintenance, Site visit…"
              list="intervention-job-type-presets"
              className="text-base"
            />
            <datalist id="intervention-job-type-presets">
              {JOB_TYPE_PRESETS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
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

          <div className="grid gap-2 rounded-2xl border bg-muted/30 p-4">
            <Label className="flex items-center gap-2 text-base font-semibold">
              <Clock3 className="h-4 w-4" />
              Must complete by
            </Label>
            <Input
              type="datetime-local"
              value={dueAtLocal}
              onChange={(e) => setDueAtLocal(e.target.value)}
              className="text-base"
            />
            <p className="text-xs text-muted-foreground">
              Used for countdown, overdue status, and reminder scheduling.
            </p>
          </div>

          <div className="grid gap-4 rounded-2xl border p-4">
            <div className="flex items-center gap-3">
              <Checkbox
                id="rem-on"
                checked={remindersEnabled}
                onCheckedChange={(v) => {
                  const on = v === true;
                  setRemindersEnabled(on);
                  if (
                    on &&
                    typeof Notification !== "undefined" &&
                    Notification.permission === "default"
                  ) {
                    void Notification.requestPermission().catch(() => {});
                  }
                }}
              />
              <Label htmlFor="rem-on" className="flex cursor-pointer items-center gap-2 text-base font-semibold">
                <Bell className="h-4 w-4" />
                Reminders (push + email when app can send)
              </Label>
            </div>
            {remindersEnabled ? (
              <div className="grid gap-4 pl-1">
                <div className="grid gap-2">
                  <Label className="text-sm">When to remind (before due)</Label>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["1d", "1 day"],
                        ["2h", "2 hours"],
                        ["30m", "30 min"],
                        ["custom", "Custom"]
                      ] as const
                    ).map(([p, label]) => (
                      <Button
                        key={p}
                        type="button"
                        size="lg"
                        variant={reminderPreset === p ? "default" : "outline"}
                        className="min-h-11"
                        onClick={() => setReminderPreset(p)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                {reminderPreset === "custom" ? (
                  <div className="grid gap-2">
                    <Label>Custom reminder time</Label>
                    <Input
                      type="datetime-local"
                      value={reminderCustomAtLocal}
                      onChange={(e) => setReminderCustomAtLocal(e.target.value)}
                      className="text-base"
                    />
                  </div>
                ) : null}
                <div className="grid gap-2">
                  <Label>Email for this visit (optional)</Label>
                  <Input
                    value={reminderEmailTo}
                    onChange={(e) => setReminderEmailTo(e.target.value)}
                    placeholder="Defaults from Settings if empty"
                    inputMode="email"
                    className="text-base"
                  />
                  <p className="text-xs text-muted-foreground">
                    Browser notifications work while the app is open; email uses your server (Resend) when online.
                    WhatsApp delivery is planned for a later release.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <InterventionLocationFields
            start={startLocation}
            end={endLocation}
            autoKm={locationKmAuto}
            onChangeStart={setStartLocation}
            onChangeEnd={setEndLocation}
            onAutoKm={setLocationKmAuto}
          />

          {/* KM + Notes */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <Label>KM (manual)</Label>
                {locationKmAuto != null ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setKm(String(locationKmAuto))}
                  >
                    Use auto ({locationKmAuto} km)
                  </Button>
                ) : null}
              </div>
              <Input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} placeholder="0" />
              {locationKmAuto != null ? (
                <p className="text-xs text-muted-foreground">Auto from route ≈ {locationKmAuto} km</p>
              ) : null}
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

          <div className="grid gap-2">
            <Label className="flex items-center gap-2">
              <Icon icon={ListChecks} />
              Checklist
            </Label>
            <DynamicChecklistEditor value={checklist} onChange={setChecklist} />
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

