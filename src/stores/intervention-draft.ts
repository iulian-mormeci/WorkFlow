import { create } from "zustand";
import type { WorkCategory, InterventionGeoStop } from "@/lib/db/workflow-db";
import type { ChecklistRow } from "@/components/checklist/dynamic-checklist-editor";
import type { RouteStopDraft } from "@/lib/routes/route-stops";

type SparePartLine = { sparePartId: string; qty: string };

export type InterventionDraft = {
  clientName: string;
  selectedClientId: string | null;
  type: string;
  workCategory: WorkCategory;
  isOfficeActivity: boolean;
  startAtLocal: string;
  endAtLocal: string;
  km: string;
  notes: string;
  durationOverride: string;
  checklist: ChecklistRow[];
  partsUsed: SparePartLine[];
  dueAtLocal: string;
  remindersEnabled: boolean;
  reminderPreset: string;
  reminderCustomAtLocal: string;
  reminderEmailTo: string;
  draftStops: RouteStopDraft[];
  startLocation?: InterventionGeoStop;
  endLocation?: InterventionGeoStop;
  locationKmAuto?: number;
};

type InterventionDraftStore = {
  draft: InterventionDraft | null;
  saveDraft: (d: InterventionDraft) => void;
  clearDraft: () => void;
};

export const useInterventionDraftStore = create<InterventionDraftStore>((set) => ({
  draft: null,
  saveDraft: (draft) => set({ draft }),
  clearDraft: () => set({ draft: null }),
}));
