import { db } from "@/lib/db/workflow-db";

function normalizeChecklistLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

function labelKey(label: string): string {
  return normalizeChecklistLabel(label).toLowerCase();
}

/**
 * Most frequent checklist item labels from the user's local history (interventions + templates).
 * Offline-first: uses Dexie data already synced from Supabase.
 */
export async function getFrequentChecklistLabels(options?: {
  limit?: number;
  excludeLabels?: string[];
  excludeInterventionId?: string;
}): Promise<string[]> {
  const limit = options?.limit ?? 8;
  const exclude = new Set(
    (options?.excludeLabels ?? [])
      .map((l) => labelKey(l))
      .filter((k) => k.length > 0)
  );

  const counts = new Map<string, { label: string; count: number }>();

  function bump(rawLabel: string) {
    const label = normalizeChecklistLabel(rawLabel);
    if (label.length < 2) return;
    const key = labelKey(label);
    if (exclude.has(key)) return;
    const prev = counts.get(key);
    counts.set(key, { label, count: (prev?.count ?? 0) + 1 });
  }

  const interventions = await db.interventions.toArray();
  for (const iv of interventions) {
    if (options?.excludeInterventionId && iv.id === options.excludeInterventionId) continue;
    for (const item of iv.checklist ?? []) {
      bump(item.label);
    }
  }

  const templates = await db.templates.toArray();
  for (const tpl of templates) {
    for (const item of tpl.checklist ?? []) {
      bump(item.label);
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((x) => x.label);
}
