import {
  db,
  type Procedure,
  type ProcedureCategory
} from "@/lib/db/workflow-db";
import { sanitizeProcedureHtml } from "@/lib/procedures/sanitize-html";

export type ProcedureFormValues = {
  title: string;
  category: ProcedureCategory;
  brand?: string;
  model?: string;
  /** Raw rich-text HTML (sanitized on write). */
  content?: string;
  tags: string[];
  imageIds: string[];
  /** Set when cloning from a global preset — stored for dedup checks. */
  sourceGlobalId?: string;
};

function clean(s: string | undefined): string | undefined {
  const v = s?.trim();
  return v ? v : undefined;
}

function normalizeTags(tags: string[]): string[] | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.length ? out : undefined;
}

/** Parse a comma-separated tag input into a clean, de-duplicated list. */
export function parseTagsInput(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createProcedure(values: ProcedureFormValues): Promise<string> {
  const nowIso = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.procedures.add({
    id,
    title: values.title.trim(),
    category: values.category,
    brand: clean(values.brand),
    model: clean(values.model),
    content: clean(sanitizeProcedureHtml(values.content ?? "")),
    tags: normalizeTags(values.tags),
    imageIds: values.imageIds.length ? values.imageIds : undefined,
    sourceGlobalId: values.sourceGlobalId ?? undefined,
    createdAt: nowIso,
    updatedAt: nowIso
  });
  return id;
}

export async function updateProcedure(
  current: Procedure,
  values: ProcedureFormValues
): Promise<void> {
  const nowIso = new Date().toISOString();
  await db.procedures.update(current.id, {
    title: values.title.trim(),
    category: values.category,
    brand: clean(values.brand),
    model: clean(values.model),
    content: clean(sanitizeProcedureHtml(values.content ?? "")),
    tags: normalizeTags(values.tags),
    imageIds: values.imageIds.length ? values.imageIds : undefined,
    updatedAt: nowIso
  });
}
