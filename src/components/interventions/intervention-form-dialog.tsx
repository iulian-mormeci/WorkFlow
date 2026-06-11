"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Bell,
  Clock3,
  ListChecks,
  NotebookPen,
  Package,
  Plus,
  Save,
  TimerReset
} from "lucide-react";
import { DynamicChecklistEditor, type ChecklistRow } from "@/components/checklist/dynamic-checklist-editor";
import { ChecklistProgress } from "@/components/checklist/checklist-progress";
import { getFrequentChecklistLabels } from "@/lib/checklist/checklist-suggestions";
import { FormSuggestionsPanel } from "@/components/suggestions/form-suggestions-panel";
import {
  formatProcedureReference,
  getIntelligentSuggestions,
  loadProcedureSuggestion,
  type ProcedureSuggestion
} from "@/lib/suggestions/intelligent-suggestions";
import { ClientPickerField } from "@/components/clients/client-picker-field";
import { createClientByName } from "@/lib/clients/create-client";
import { getOrCreateOfficeClientId } from "@/lib/clients/office-client";
import { InterventionLocationFields } from "@/components/interventions/intervention-location-fields";
import { RouteStopsEditor, buildRoundTripStops } from "@/components/interventions/route-stops-editor";
import type { RouteStopDraft } from "@/lib/routes/route-stops";
import { upsertRouteStop } from "@/lib/routes/route-stops";
import {
  interventionEndpointsFromRouteStopDrafts,
  totalKmFromRouteStops
} from "@/lib/routes/route-distance";
import { scheduleWorkflowSync, syncWorkflowNow } from "@/lib/sync/sync-engine";
import { JOB_TYPE_PRESETS } from "@/lib/interventions/job-types";
import { preservedWorkflowStatus } from "@/lib/interventions/intervention-helpers";
import { useTranslations } from "next-intl";
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
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "new" | "edit";
  interventionId?: string;
  onSaved?: (id: string) => void;
  initial?: Partial<{
    /** Opens form preset for client field work vs office activity. */
    formPreset?: "client" | "office";
    clientName: string;
    defaultClientId?: string | null;
    defaultStartAt?: string;
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

async function resolveClientIdForIntervention(
  selectedClientId: string | null,
  clientNameRaw: string
): Promise<string> {
  const name = clientNameRaw.trim();
  if (name.length < 2) throw new Error("workflow.i18n:clientNameTooShort");

  const nowIso = new Date().toISOString();

  if (selectedClientId) {
    const cl = await db.clients.get(selectedClientId);
    if (cl) {
      if (cl.name.trim() !== name) {
        await db.clients.update(selectedClientId, { name, updatedAt: nowIso });
        scheduleWorkflowSync();
      }
      return selectedClientId;
    }
  }

  const existing = await db.clients
    .filter((c) => c.name.trim().toLowerCase() === name.toLowerCase())
    .first();
  if (existing) return existing.id;

  throw new Error("workflow.i18n:clientRequired");
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
  const t = useTranslations();
  const { open, onOpenChange, mode, interventionId, onSaved, initial } = props;

  const clients = useLiveQuery(async () => db.clients.orderBy("name").toArray(), []);
  const spareParts = useLiveQuery(async () => db.spareParts.orderBy("name").toArray(), []);

  const existing = useLiveQuery(async () => {
    if (mode !== "edit" || !interventionId) return null;
    return await db.interventions.get(interventionId);
  }, [mode, interventionId]);

  const [clientName, setClientName] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [type, setType] = useState("maintenance");
  const [workCategory, setWorkCategory] = useState<WorkCategory>("intervention");
  const [isOfficeActivity, setIsOfficeActivity] = useState(false);
  const [startAtLocal, setStartAtLocal] = useState("");
  const [endAtLocal, setEndAtLocal] = useState("");
  const [km, setKm] = useState("");
  const [notes, setNotes] = useState("");
  const [durationOverride, setDurationOverride] = useState("");
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const checklistLabelKey = checklist.map((x) => x.label).join("\n");
  const intelligentSuggestions = useLiveQuery(
    async () => {
      if (!open || mode !== "new") return null;
      return getIntelligentSuggestions({
        kind: "intervention",
        clientId: selectedClientId,
        clientName,
        interventionType: type,
        notes,
        excludeInterventionId: interventionId,
        existingChecklistLabels: checklist.map((x) => x.label)
      });
    },
    [open, mode, selectedClientId, clientName, type, notes, interventionId, checklistLabelKey]
  );
  const checklistSuggestions = useLiveQuery(
    async () => {
      if (!open) return [];
      return getFrequentChecklistLabels({
        excludeLabels: checklist.map((x) => x.label),
        excludeInterventionId: mode === "edit" ? interventionId : undefined
      });
    },
    [open, mode, interventionId, checklistLabelKey]
  );
  const [partsUsed, setPartsUsed] = useState<SparePartLine[]>([]);
  const [dueAtLocal, setDueAtLocal] = useState("");
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderPreset, setReminderPreset] = useState<ReminderPreset>("2h");
  const [reminderCustomAtLocal, setReminderCustomAtLocal] = useState("");
  const [reminderEmailTo, setReminderEmailTo] = useState("");
  const [startLocation, setStartLocation] = useState<InterventionGeoStop | undefined>();
  const [endLocation, setEndLocation] = useState<InterventionGeoStop | undefined>();
  const [locationKmAuto, setLocationKmAuto] = useState<number | undefined>();
  const [draftStops, setDraftStops] = useState<RouteStopDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const durationMinutes = useMemo(
    () => {
      const manual = Number(durationOverride);
      if (Number.isFinite(manual) && manual > 0) return Math.round(manual);
      return computeDurationMinutes(startAtLocal, endAtLocal);
    },
    [startAtLocal, endAtLocal, durationOverride]
  );

  const isOfficePreset = workCategory === "activity" && isOfficeActivity;

  const canSave = useMemo(() => {
    if (isOfficePreset) return true;
    return Boolean(selectedClientId) && clientName.trim().length > 1;
  }, [clientName, selectedClientId, isOfficePreset]);

  const roundTripAirKm = useMemo(() => totalKmFromRouteStops(draftStops), [draftStops]);

  useEffect(() => {
    if (!open) return;
    setError(null);

    if (mode === "new") {
      const preset = initial?.formPreset;
      setClientName(initial?.clientName ?? "");
      setType(initial?.type ?? "maintenance");
      setWorkCategory(
        initial?.workCategory ?? (preset === "office" ? "activity" : "intervention")
      );
      setIsOfficeActivity(
        initial?.isOfficeActivity ?? (preset === "office" ? true : false)
      );
      setStartAtLocal(initial?.defaultStartAt ?? "");
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
      setDraftStops([]);
      setSelectedClientId(null);
      return;
    }

    if (mode === "edit" && existing) {
      const start = existing.startAt ? new Date(existing.startAt) : null;
      const end = existing.endAt ? new Date(existing.endAt) : null;

      const client = clients?.find((c) => c.id === existing.clientId);
      setClientName(client?.name ?? "");
      setSelectedClientId(existing.clientId ?? null);
      setType(existing.type ?? "maintenance");
      setWorkCategory(existing.workCategory ?? "intervention");
      setIsOfficeActivity(existing.isOfficeActivity ?? false);
      setStartAtLocal(start ? toLocalDateTimeInputValue(start) : "");
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
    initial?.defaultDurationMinutes,
    initial?.defaultStartAt,
    initial?.formPreset
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
      setSelectedClientId(cid);
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

  function addChecklistLabel(label: string) {
    const clean = label.trim();
    if (clean.length < 2) return;
    const key = clean.toLowerCase();
    if (checklist.some((x) => x.label.trim().toLowerCase() === key)) return;
    setChecklist([...checklist, { id: crypto.randomUUID(), label: clean, done: false }]);
  }

  async function addProcedureSuggestion(proc: ProcedureSuggestion) {
    const loaded = await loadProcedureSuggestion(proc);
    if (!loaded) return;
    const ref = formatProcedureReference(loaded);
    setNotes((prev) => (prev.includes(ref) ? prev : prev ? `${prev}\n\n${ref}` : ref));
    addChecklistLabel(loaded.title);
  }

  function applySuggestedDuration(minutes: number) {
    setDurationOverride(String(minutes));
    if (startAtLocal && !endAtLocal) {
      const start = new Date(startAtLocal);
      if (!Number.isNaN(start.getTime())) {
        setEndAtLocal(toLocalDateTimeInputValue(new Date(start.getTime() + minutes * 60_000)));
      }
    }
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
        title: t("interventions.form.toasts.stillLoadingTitle"),
        description: t("interventions.form.toasts.stillLoadingBody"),
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      let clientId: string;
      if (isOfficePreset && !selectedClientId) {
        clientId = await getOrCreateOfficeClientId();
      } else {
        clientId = await resolveClientIdForIntervention(selectedClientId, clientName);
      }

      const startIso = startAtLocal ? new Date(startAtLocal).toISOString() : undefined;
      const endIso = endAtLocal ? new Date(endAtLocal).toISOString() : undefined;

      const sparePartsUsed = partsUsed
        .filter((l) => l.sparePartId && Number(l.qty) > 0)
        .map((l) => ({ sparePartId: l.sparePartId, qty: Number(l.qty) }));

      const existingPhotoIds =
        mode === "edit" && interventionId && existing?.photoIds?.length
          ? [...existing.photoIds]
          : undefined;

      const fromDraft = interventionEndpointsFromRouteStopDrafts(draftStops);
      const savedStartLocation = fromDraft.startLocation ?? startLocation;
      const savedEndLocation = fromDraft.endLocation ?? endLocation;
      const savedLocationKmAuto =
        fromDraft.locationKmAuto != null ? fromDraft.locationKmAuto : locationKmAuto;

      const dueIso = dueAtLocal ? new Date(dueAtLocal).toISOString() : undefined;
      const reminderCustomIso =
        remindersEnabled && reminderPreset === "custom" && reminderCustomAtLocal
          ? new Date(reminderCustomAtLocal).toISOString()
          : undefined;
      const nextReminderEmail = remindersEnabled ? reminderEmailTo.trim() || undefined : undefined;
      const nextPreset = remindersEnabled ? reminderPreset : undefined;

      if (remindersEnabled && !dueIso) {
        toast({
          title: t("interventions.form.toasts.reminderNeedsDueTitle"),
          description: t("interventions.form.toasts.reminderNeedsDueBody"),
          variant: "destructive"
        });
        return;
      }

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
          startLocation: savedStartLocation,
          endLocation: savedEndLocation,
          locationKmAuto: savedLocationKmAuto,
          updatedAt: nowIso
        };
        await db.interventions.put(payload);
        savedId = payload.id;
        scheduleWorkflowSync();
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
          startLocation: savedStartLocation,
          endLocation: savedEndLocation,
          locationKmAuto: savedLocationKmAuto,
          createdAt: nowIso,
          updatedAt: nowIso
        };
        await db.interventions.add(payload);
        savedId = payload.id;
        scheduleWorkflowSync();

        // Online-first routing: if user prepared draft stops in the create flow, persist them to Supabase.
        // Best-effort (still works if Supabase not configured / offline).
        if (draftStops.length) {
          try {
            syncWorkflowNow(); // push the intervention row so FK resolves quickly
            await Promise.all(draftStops.map((s) => upsertRouteStop(payload.id, s)));
          } catch {
            /* ignore */
          }
        }
      }

      // Auto-create stock OUT movements for spare parts used (first usable version)
      if (sparePartsUsed.length) {
        for (const line of sparePartsUsed) {
          await db.stockMovements.add({
            id: crypto.randomUUID(),
            sparePartId: line.sparePartId,
            type: "out",
            qty: line.qty,
            reason: t("interventions.form.stockReasonUsedInIntervention"),
            interventionId: savedId,
            createdAt: nowIso
          });
        }
      }

      onOpenChange(false);
      onSaved?.(savedId);
      toast({
        title:
          mode === "new"
            ? t("interventions.form.toasts.savedTitleNew")
            : t("interventions.form.toasts.savedTitleEdit"),
        description:
          mode === "new"
            ? t("interventions.form.toasts.savedBodyNew")
            : t("interventions.form.toasts.savedBodyEdit")
      });

      if (mode === "new") {
        router.push(`/interventions/${savedId}`);
        router.refresh();
      }
    } catch (e: any) {
      const msg =
        e?.message === "workflow.i18n:clientNameTooShort"
          ? t("clients.errors.nameTooShort")
          : e?.message === "workflow.i18n:clientRequired"
            ? t("clients.errors.clientRequired")
            : (e?.message ?? t("interventions.form.errors.saveFailed"));
      setError(msg);
      toast({
        title: t("interventions.form.toasts.saveFailedTitle"),
        description: msg,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }

  const stockByPartId = useLiveQuery(async () => await computeStockByPartId(), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[88dvh] w-[calc(100%-1.5rem)] max-w-xl flex-col overflow-hidden p-0",
          "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:left-0 max-md:max-h-[94dvh] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-2xl max-md:border-b-0"
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3 md:px-6 md:py-4">
          <DialogTitle>
            {mode === "new" ? t("interventions.form.titleNew") : t("interventions.form.titleEdit")}
          </DialogTitle>
          <DialogDescription>
            {t("interventions.form.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 md:px-6">
        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid min-w-0 gap-4 md:gap-5">
          {/* Client */}
          {!isOfficePreset ? (
            <ClientPickerField
              clients={clients}
              clientName={clientName}
              onClientNameChange={setClientName}
              selectedClientId={selectedClientId}
              onSelectClient={(id, name) => {
                if (id) {
                  setSelectedClientId(id);
                  setClientName(name);
                } else {
                  setSelectedClientId(null);
                }
              }}
              onCreateNew={async (name) => {
                try {
                  const id = await createClientByName(name);
                  const cl = await db.clients.get(id);
                  setSelectedClientId(id);
                  setClientName(cl?.name ?? name);
                  toast({
                    title: t("clients.toasts.createdTitle"),
                    description: t("clients.toasts.createdBody", { name: cl?.name ?? name })
                  });
                } catch (e) {
                  toast({
                    title: t("clients.toasts.createFailedTitle"),
                    description: e instanceof Error ? e.message : t("common.unknownError"),
                    variant: "destructive"
                  });
                }
              }}
              disabled={saving}
              active={open}
            />
          ) : (
            <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              {t("interventions.form.officeClientHint")}
            </p>
          )}

          {/* Intervention vs activity */}
          <div className="grid min-w-0 gap-2">
            <Label>{t("interventions.form.recordAs")}</Label>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
              <button
                type="button"
                onClick={() => setWorkCategory("intervention")}
                className={`min-h-12 touch-manipulation rounded-xl border-2 p-3 text-left transition md:rounded-2xl md:p-4 ${
                  workCategory === "intervention"
                    ? "border-primary bg-primary/5"
                    : "border-muted bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <div className="text-sm font-semibold">{t("common.intervention")}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t("interventions.form.recordAsInterventionHint")}</div>
              </button>
              <button
                type="button"
                onClick={() => setWorkCategory("activity")}
                className={`min-h-12 touch-manipulation rounded-xl border-2 p-3 text-left transition md:rounded-2xl md:p-4 ${
                  workCategory === "activity"
                    ? "border-primary bg-primary/5"
                    : "border-muted bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <div className="text-sm font-semibold">{t("common.activity")}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t("interventions.form.recordAsActivityHint")}</div>
              </button>
            </div>
          </div>

          {workCategory === "activity" ? (
            <div className="flex min-h-12 items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3">
              <Checkbox
                id="iv-office"
                checked={isOfficeActivity}
                onCheckedChange={(v) => setIsOfficeActivity(v === true)}
              />
              <Label htmlFor="iv-office" className="cursor-pointer text-sm font-normal leading-snug">
                {t("interventions.form.onSiteOfficeLabel")}
              </Label>
            </div>
          ) : null}

          {/* Job type (free text) */}
          <div className="grid min-w-0 gap-2">
            <Label>{t("interventions.form.jobType")}</Label>
            <Input
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder={t("interventions.form.jobTypePlaceholder")}
              list="intervention-job-type-presets"
              className="min-h-12 w-full min-w-0 max-w-full text-base"
            />
            <datalist id="intervention-job-type-presets">
              {JOB_TYPE_PRESETS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          {mode === "new" ? (
            <FormSuggestionsPanel
              suggestions={intelligentSuggestions ?? undefined}
              loading={intelligentSuggestions === undefined}
              onAddChecklist={addChecklistLabel}
              onAddProcedure={(proc) => void addProcedureSuggestion(proc)}
              onApplyDuration={applySuggestedDuration}
              existingChecklistLabels={checklist.map((x) => x.label)}
              disabled={saving}
            />
          ) : null}

          {/* Time (optional) */}
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            <div className="grid min-w-0 gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="flex items-center gap-2">
                  <Icon icon={Clock3} />
                  {t("interventions.form.start")}
                </Label>
                <Button variant="outline" size="sm" type="button" className="min-h-10 touch-manipulation" onClick={() => setNow("start")}>
                  <TimerReset className="h-4 w-4" />
                  {t("common.now")}
                </Button>
              </div>
              <Input type="datetime-local" value={startAtLocal} onChange={(e) => setStartAtLocal(e.target.value)} className="min-h-12 w-full min-w-0 max-w-full text-base" />
              <div className="text-xs text-muted-foreground">
                {t("interventions.form.startHint")}
              </div>
            </div>
            <div className="grid min-w-0 gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="flex items-center gap-2">
                  <Icon icon={Clock3} />
                  {t("interventions.form.end")}
                </Label>
                <Button variant="outline" size="sm" type="button" className="min-h-10 touch-manipulation" onClick={() => setNow("end")}>
                  <TimerReset className="h-4 w-4" />
                  {t("common.now")}
                </Button>
              </div>
              <Input type="datetime-local" value={endAtLocal} onChange={(e) => setEndAtLocal(e.target.value)} className="min-h-12 w-full min-w-0 max-w-full text-base" />
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted px-4 py-3 text-sm">
            <div className="text-muted-foreground">{t("interventions.form.autoDuration")}</div>
            <div className="font-semibold">
              {durationMinutes != null ? t("common.minutesShort", { minutes: durationMinutes }) : "—"}
            </div>
          </div>

          <div className="grid min-w-0 gap-2">
            <Label>{t("interventions.form.durationOverride")}</Label>
            <Input
              inputMode="numeric"
              value={durationOverride}
              onChange={(e) => setDurationOverride(e.target.value)}
              placeholder={t("interventions.form.durationOverridePlaceholder")}
              className="min-h-12 w-full min-w-0 max-w-full text-base"
            />
            <div className="text-xs text-muted-foreground">
              {t("interventions.form.durationOverrideHint")}
            </div>
          </div>

          <div className="grid min-w-0 gap-2 rounded-xl border bg-muted/30 p-3 md:rounded-2xl md:p-4">
            <Label className="flex items-center gap-2 text-base font-semibold">
              <Clock3 className="h-4 w-4" />
              {t("interventions.form.mustCompleteBy")}
            </Label>
            <Input
              type="datetime-local"
              value={dueAtLocal}
              onChange={(e) => setDueAtLocal(e.target.value)}
              className="min-h-12 w-full min-w-0 max-w-full text-base"
            />
            <p className="text-xs text-muted-foreground">
              {t("interventions.form.mustCompleteByHint")}
            </p>
          </div>

          <div className="grid min-w-0 gap-4 rounded-xl border p-3 md:rounded-2xl md:p-4">
            <div className="flex min-h-12 items-center gap-3">
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
                {t("interventions.form.remindersTitle")}
              </Label>
            </div>
            {remindersEnabled ? (
              <div className="grid gap-4 pl-1">
                <div className="grid gap-2">
                  <Label className="text-sm">{t("interventions.form.reminderWhen")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["1d", t("interventions.form.reminderPresets.oneDay")],
                        ["2h", t("interventions.form.reminderPresets.twoHours")],
                        ["30m", t("interventions.form.reminderPresets.thirtyMinutes")],
                        ["custom", t("interventions.form.reminderPresets.custom")]
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
                    <Label>{t("interventions.form.customReminderTime")}</Label>
                    <Input
                      type="datetime-local"
                      value={reminderCustomAtLocal}
                      onChange={(e) => setReminderCustomAtLocal(e.target.value)}
                      className="min-h-12 w-full min-w-0 max-w-full text-base"
                    />
                  </div>
                ) : null}
                <div className="grid gap-2">
                  <Label>{t("interventions.form.reminderEmailLabel")}</Label>
                  <Input
                    value={reminderEmailTo}
                    onChange={(e) => setReminderEmailTo(e.target.value)}
                    placeholder={t("interventions.form.reminderEmailPlaceholder")}
                    inputMode="email"
                    className="min-h-12 w-full min-w-0 max-w-full text-base"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("interventions.form.reminderEmailHint")}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {mode === "edit" && interventionId ? (
            <RouteStopsEditor interventionId={interventionId} />
          ) : (
            <div className="grid min-w-0 gap-3">
              <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3 md:flex-row md:items-center md:justify-between md:rounded-2xl md:p-4">
                <div className="min-w-0">
                  <div className="text-base font-semibold">{t("interventions.form.roundTrip.title")}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t("interventions.form.roundTrip.subtitle")}
                  </div>
                </div>
                <Button
                  type="button"
                  size="lg"
                  className="min-h-12 w-full touch-manipulation px-5 text-base font-semibold md:min-h-14 md:min-w-[11rem] md:w-auto"
                  onClick={async () => {
                    const officeAddress =
                      typeof window !== "undefined"
                        ? (localStorage.getItem("workflow:officeAddress") ?? "").trim()
                        : "";

                    let start: { address?: string; lat?: number; lng?: number } | undefined;
                    try {
                      if (navigator.geolocation) {
                        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                          navigator.geolocation.getCurrentPosition(resolve, reject, {
                            enableHighAccuracy: true,
                            timeout: 10_000,
                            maximumAge: 60_000
                          });
                        });
                        const lat = pos.coords.latitude;
                        const lng = pos.coords.longitude;
                        let addr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                        try {
                          const res = await fetch(`/api/geocode?lat=${lat}&lon=${lng}`);
                          const arr = (await res.json()) as { address?: string }[];
                          if (arr?.[0]?.address) addr = String(arr[0].address);
                        } catch {
                          /* ignore */
                        }
                        start = { address: addr, lat, lng };
                      }
                    } catch {
                      start = undefined;
                    }

                    let office: { address?: string; lat?: number; lng?: number } | undefined;
                    if (officeAddress) {
                      office = { address: officeAddress };
                      try {
                        const res = await fetch(`/api/geocode?q=${encodeURIComponent(officeAddress)}`);
                        const arr = (await res.json()) as { address: string; lat: number; lng: number }[];
                        if (arr?.[0]) {
                          office = { address: arr[0].address, lat: arr[0].lat, lng: arr[0].lng };
                        }
                      } catch {
                        /* ignore */
                      }
                    } else {
                      office = { address: t("interventions.form.officeFallback") };
                    }

                    setDraftStops(
                      buildRoundTripStops({
                        start,
                        office,
                        labels: {
                          start: t("route.stops.roundTripLabels.start"),
                          office: t("route.stops.roundTripLabels.office"),
                          end: t("route.stops.roundTripLabels.end")
                        }
                      })
                    );
                  }}
                >
                  {t("interventions.form.roundTripCta")}
                </Button>
              </div>

              {draftStops.length >= 2 && roundTripAirKm > 0 ? (
                <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-primary/5 px-3 py-3 md:flex-row md:items-center md:justify-between md:rounded-2xl md:px-5">
                  <span className="text-sm text-muted-foreground">{t("interventions.form.roundTripEstimate")}</span>
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <span className="text-xl font-bold tabular-nums tracking-tight">
                      {roundTripAirKm.toFixed(1)} km
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="min-h-11 shrink-0 touch-manipulation"
                      onClick={() => {
                        setKm(roundTripAirKm.toFixed(1));
                        setLocationKmAuto(roundTripAirKm);
                      }}
                    >
                      {t("interventions.form.applyRouteKmEstimate", {
                        km: roundTripAirKm.toFixed(1)
                      })}
                    </Button>
                  </div>
                </div>
              ) : null}

              {draftStops.length ? (
                <RouteStopsEditor mode="draft" draftStops={draftStops} onDraftStopsChange={setDraftStops} />
              ) : (
                <InterventionLocationFields
                  start={startLocation}
                  end={endLocation}
                  autoKm={locationKmAuto}
                  onChangeStart={setStartLocation}
                  onChangeEnd={setEndLocation}
                  onAutoKm={setLocationKmAuto}
                />
              )}
            </div>
          )}

          {/* KM + Notes */}
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            <div className="grid min-w-0 gap-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <Label>{t("interventions.form.kmManual")}</Label>
                {locationKmAuto != null ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-10 shrink-0 touch-manipulation"
                    onClick={() => setKm(String(locationKmAuto))}
                  >
                    {t("interventions.form.useAutoKm", { km: locationKmAuto })}
                  </Button>
                ) : null}
              </div>
              <Input
                inputMode="numeric"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                placeholder={t("common.numericZero")}
                className="min-h-12 w-full min-w-0 max-w-full text-base"
              />
              {locationKmAuto != null ? (
                <p className="text-xs text-muted-foreground">{t("interventions.form.autoFromRouteKm", { km: locationKmAuto })}</p>
              ) : null}
            </div>
            <div className="grid min-w-0 gap-2">
              <Label className="flex items-center gap-2">
                <Icon icon={NotebookPen} />
                {t("interventions.form.notes")}
              </Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("interventions.form.notesPlaceholder")} className="min-h-24 w-full min-w-0 max-w-full text-base" />
            </div>
          </div>

          {/* Spare parts used */}
          <div className="grid min-w-0 gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="flex items-center gap-2">
                <Icon icon={Package} />
                {t("interventions.form.sparePartsUsed")}
              </Label>
              <Button variant="outline" size="sm" type="button" className="min-h-10 touch-manipulation" onClick={addPartLine}>
                <Plus className="h-4 w-4" />
                {t("common.add")}
              </Button>
            </div>

            {partsUsed.length === 0 ? (
              <div className="rounded-xl border bg-muted px-4 py-3 text-sm text-muted-foreground">
                {t("interventions.form.noSpareParts")}
              </div>
            ) : (
              <div className="grid gap-2">
                {partsUsed.map((line, idx) => {
                  const part: SparePart | undefined = spareParts?.find((p) => p.id === line.sparePartId);
                  const available = line.sparePartId ? stockByPartId?.get(line.sparePartId) ?? 0 : null;
                  return (
                    <div key={idx} className="grid min-w-0 gap-2 rounded-xl border p-3 md:grid-cols-[1fr_140px_auto] md:items-center">
                      <div className="grid min-w-0 gap-1">
                        <select
                          className="min-h-12 w-full min-w-0 max-w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                          value={line.sparePartId}
                          onChange={(e) => updatePartLine(idx, { sparePartId: e.target.value })}
                        >
                          <option value="">{t("interventions.form.selectSparePart")}</option>
                          {(spareParts ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku})
                            </option>
                          ))}
                        </select>
                        {part ? (
                          <div className="text-xs text-muted-foreground">
                            {t("interventions.form.availableSparePart", {
                              available: available ?? "—",
                              unit: part.unit ?? ""
                            })}
                          </div>
                        ) : null}
                      </div>

                      <Input
                        inputMode="numeric"
                        value={line.qty}
                        onChange={(e) => updatePartLine(idx, { qty: e.target.value })}
                        placeholder={t("interventions.form.qty")}
                        className="min-h-12 w-full min-w-0 max-w-full text-base"
                      />

                      <Button variant="ghost" type="button" className="min-h-12 touch-manipulation" onClick={() => removePartLine(idx)}>
                        {t("common.remove")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid min-w-0 gap-3">
            <Label className="flex items-center gap-2">
              <Icon icon={ListChecks} />
              {t("interventions.form.checklist")}
            </Label>
            <ChecklistProgress
              done={checklist.filter((x) => x.done).length}
              total={checklist.length}
            />
            <DynamicChecklistEditor
              value={checklist}
              onChange={setChecklist}
              suggestions={checklistSuggestions ?? []}
            />
          </div>
        </div>
        </div>

        <div
          className="flex shrink-0 flex-col-reverse gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-end md:gap-3 md:px-6"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
            <Button
              variant="outline"
              type="button"
              className="min-h-12 w-full touch-manipulation sm:min-w-[5.5rem] sm:w-auto"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!canSave || saving}
              type="button"
              className="min-h-12 w-full touch-manipulation sm:min-w-[8rem] sm:w-auto"
              onClick={save}
            >
              <Save className="h-4 w-4" />
              {saving ? t("common.saving") : t("common.save")}
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

