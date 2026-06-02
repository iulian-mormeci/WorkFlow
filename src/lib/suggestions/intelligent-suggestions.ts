import { db, type GlobalProcedure, type Procedure } from "@/lib/db/workflow-db";
import { procedureHtmlToText } from "@/lib/procedures/sanitize-html";

export type IntelligentSuggestionContext = {
  kind: "intervention" | "activity";
  clientId?: string | null;
  clientName?: string;
  interventionType?: string;
  notes?: string;
  title?: string;
  description?: string;
  category?: string;
  excludeInterventionId?: string;
  existingChecklistLabels?: string[];
};

export type ChecklistSuggestion = {
  label: string;
  score: number;
  source: "client" | "type" | "template" | "global";
};

export type ProcedureSuggestion = {
  id: string;
  scope: "personal" | "global";
  title: string;
  brand?: string;
  model?: string;
  score: number;
};

export type DurationSuggestion = {
  minutes: number;
  sampleCount: number;
  score: number;
};

export type IntelligentSuggestions = {
  checklists: ChecklistSuggestion[];
  procedures: ProcedureSuggestion[];
  duration: DurationSuggestion | null;
};

const DAY_MS = 86_400_000;

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

function labelKey(label: string): string {
  return normalizeLabel(label).toLowerCase();
}

function tokenize(...parts: (string | undefined)[]): string[] {
  const raw = parts.filter(Boolean).join(" ").toLowerCase();
  const tokens = raw.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  return [...new Set(tokens)];
}

function recencyBonus(updatedAt?: string): number {
  if (!updatedAt) return 0;
  const age = Date.now() - new Date(updatedAt).getTime();
  if (!Number.isFinite(age) || age < 0) return 0;
  if (age <= 30 * DAY_MS) return 2;
  if (age <= 90 * DAY_MS) return 1;
  return 0;
}

async function rankChecklists(ctx: IntelligentSuggestionContext): Promise<ChecklistSuggestion[]> {
  const exclude = new Set(
    (ctx.existingChecklistLabels ?? []).map((l) => labelKey(l)).filter(Boolean)
  );
  const scores = new Map<string, ChecklistSuggestion>();

  function bump(label: string, delta: number, source: ChecklistSuggestion["source"], updatedAt?: string) {
    const clean = normalizeLabel(label);
    if (clean.length < 2) return;
    const key = labelKey(clean);
    if (exclude.has(key)) return;
    const prev = scores.get(key);
    const score = (prev?.score ?? 0) + delta + recencyBonus(updatedAt);
    const src =
      prev && prev.source !== "global" && source === "global" ? prev.source : source;
    scores.set(key, { label: clean, score, source: src });
  }

  const interventions = await db.interventions.toArray();
  const templates = await db.templates.toArray();
  const clientId = ctx.clientId ?? undefined;
  const typeKey = (ctx.interventionType ?? "").trim().toLowerCase();

  for (const iv of interventions) {
    if (ctx.excludeInterventionId && iv.id === ctx.excludeInterventionId) continue;
    const sameClient = clientId && iv.clientId === clientId;
    const sameType = typeKey && (iv.type ?? "").trim().toLowerCase() === typeKey;
    for (const item of iv.checklist ?? []) {
      if (sameClient) bump(item.label, 4, "client", iv.updatedAt);
      else if (sameType) bump(item.label, 2.5, "type", iv.updatedAt);
      else bump(item.label, 1, "global", iv.updatedAt);
    }
  }

  for (const tpl of templates) {
    const tplClient = tpl.defaultClientId ?? null;
    const sameClient = clientId && tplClient === clientId;
    const sameType = typeKey && (tpl.type ?? "").trim().toLowerCase() === typeKey;
    for (const item of tpl.checklist ?? []) {
      if (sameClient) bump(item.label, 3, "template", tpl.updatedAt);
      else if (sameType) bump(item.label, 2, "template", tpl.updatedAt);
    }
  }

  if (ctx.kind === "activity") {
    const catKey = (ctx.category ?? "").trim().toLowerCase();
    const activities = await db.activities.toArray();
    for (const a of activities) {
      const sameCat = catKey && (a.category ?? "").trim().toLowerCase() === catKey;
      const title = a.title?.trim();
      if (!title) continue;
      if (sameCat) bump(title, 3, "client", a.updatedAt);
      else bump(title, 0.8, "global", a.updatedAt);
    }
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, 10);
}

function scoreProcedure(
  proc: Pick<Procedure | GlobalProcedure, "title" | "brand" | "model" | "tags" | "content" | "category">,
  tokens: string[],
  haystack: string
): number {
  let score = 0;
  const brand = (proc.brand ?? "").toLowerCase();
  const model = (proc.model ?? "").toLowerCase();
  const title = proc.title.toLowerCase();

  for (const tok of tokens) {
    if (brand && (brand === tok || brand.includes(tok))) score += 5;
    if (model && (model === tok || model.includes(tok))) score += 5;
    if (title.includes(tok)) score += 2;
    for (const tag of proc.tags ?? []) {
      if (tag.toLowerCase().includes(tok)) score += 1.5;
    }
  }

  if (proc.category === "brand_model" && tokens.some((t) => brand.includes(t) || model.includes(t))) {
    score += 3;
  }

  const body = procedureHtmlToText(proc.content ?? "").toLowerCase();
  for (const tok of tokens) {
    if (body.includes(tok)) score += 0.5;
  }

  if (haystack && title && haystack.includes(title)) score += 4;
  return score;
}

async function rankProcedures(ctx: IntelligentSuggestionContext): Promise<ProcedureSuggestion[]> {
  const haystack = [
    ctx.clientName,
    ctx.interventionType,
    ctx.notes,
    ctx.title,
    ctx.description,
    ctx.category
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const tokens = tokenize(
    ctx.clientName,
    ctx.interventionType,
    ctx.notes,
    ctx.title,
    ctx.description,
    ctx.category
  );

  const [personal, global] = await Promise.all([
    db.procedures.toArray(),
    db.globalProcedures.toArray()
  ]);

  const ranked: ProcedureSuggestion[] = [];

  for (const p of personal) {
    const score = scoreProcedure(p, tokens, haystack);
    if (score < 1.5) continue;
    ranked.push({
      id: p.id,
      scope: "personal",
      title: p.title,
      brand: p.brand,
      model: p.model,
      score: score + 0.5
    });
  }

  for (const p of global) {
    const score = scoreProcedure(p, tokens, haystack);
    if (score < 1.5) continue;
    ranked.push({
      id: p.id,
      scope: "global",
      title: p.title,
      brand: p.brand,
      model: p.model,
      score
    });
  }

  if (!ranked.length) {
    for (const p of global.slice(0, 4)) {
      ranked.push({
        id: p.id,
        scope: "global",
        title: p.title,
        brand: p.brand,
        model: p.model,
        score: 1
      });
    }
    for (const p of personal.slice(0, 4)) {
      ranked.push({
        id: p.id,
        scope: "personal",
        title: p.title,
        brand: p.brand,
        model: p.model,
        score: 1
      });
    }
  }

  const seen = new Set<string>();
  return ranked
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .filter((p) => {
      const k = `${p.scope}:${p.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 8);
}

async function suggestDuration(ctx: IntelligentSuggestionContext): Promise<DurationSuggestion | null> {
  if (ctx.kind !== "intervention") return null;

  const clientId = ctx.clientId ?? undefined;
  const typeKey = (ctx.interventionType ?? "").trim().toLowerCase();
  const buckets = new Map<number, { total: number; count: number; score: number }>();

  const interventions = await db.interventions.toArray();
  for (const iv of interventions) {
    if (ctx.excludeInterventionId && iv.id === ctx.excludeInterventionId) continue;
    const mins = iv.durationMinutes;
    if (!mins || mins <= 0 || mins > 24 * 60) continue;

    let weight = 1;
    if (clientId && iv.clientId === clientId) weight += 4;
    if (typeKey && (iv.type ?? "").trim().toLowerCase() === typeKey) weight += 2;
    weight += recencyBonus(iv.updatedAt);

    const rounded = Math.round(mins / 5) * 5 || mins;
    const prev = buckets.get(rounded) ?? { total: 0, count: 0, score: 0 };
    buckets.set(rounded, {
      total: prev.total + mins * weight,
      count: prev.count + weight,
      score: prev.score + weight
    });
  }

  if (!buckets.size) return null;

  let bestMinutes = 0;
  let bestScore = 0;
  let bestCount = 0;
  for (const [minutes, bucket] of buckets) {
    if (bucket.score > bestScore) {
      bestScore = bucket.score;
      bestMinutes = minutes;
      bestCount = Math.round(bucket.count);
    }
  }

  if (!bestMinutes) return null;
  return { minutes: bestMinutes, sampleCount: bestCount, score: bestScore };
}

export async function getIntelligentSuggestions(
  ctx: IntelligentSuggestionContext
): Promise<IntelligentSuggestions> {
  const [checklists, procedures, duration] = await Promise.all([
    rankChecklists(ctx),
    rankProcedures(ctx),
    suggestDuration(ctx)
  ]);
  return { checklists, procedures, duration };
}

export async function loadProcedureSuggestion(
  suggestion: ProcedureSuggestion
): Promise<Procedure | GlobalProcedure | undefined> {
  if (suggestion.scope === "global") return db.globalProcedures.get(suggestion.id);
  return db.procedures.get(suggestion.id);
}

export function formatProcedureReference(
  proc: Pick<Procedure | GlobalProcedure, "title" | "brand" | "model" | "content">
): string {
  const parts = [proc.title];
  if (proc.brand) parts.push(proc.brand);
  if (proc.model) parts.push(proc.model);
  const header = parts.join(" · ");
  const body = procedureHtmlToText(proc.content ?? "").trim();
  return body ? `${header}\n${body}` : header;
}
