import type { CompanyProcedure, GlobalProcedure, Procedure, ProcedureCategory } from "@/lib/db/workflow-db";
import { procedureHtmlToText } from "@/lib/procedures/sanitize-html";

/** Fields shared by personal and global procedure rows (UI + search). */
export type ProcedureLike = {
  id: string;
  title: string;
  category: ProcedureCategory;
  brand?: string;
  model?: string;
  content?: string;
  tags?: string[];
  imageIds?: string[];
};

export function procedureLikeFromPersonal(p: Procedure): ProcedureLike {
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    brand: p.brand,
    model: p.model,
    content: p.content,
    tags: p.tags,
    imageIds: p.imageIds
  };
}

export function procedureLikeFromGlobal(p: GlobalProcedure): ProcedureLike {
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    brand: p.brand,
    model: p.model,
    content: p.content,
    tags: p.tags,
    imageIds: p.imageIds
  };
}

export function procedureLikeFromCompany(p: CompanyProcedure): ProcedureLike {
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    brand: p.brand,
    model: p.model,
    content: p.content,
    tags: p.tags,
    imageIds: p.imageIds
  };
}

export type PublishStatus = "approved" | "pending" | "rejected";

/**
 * Best-known status of "this personal procedure was submitted to the global
 * catalog", if any (a personal procedure can be resubmitted after rejection,
 * so pick the most favorable status: approved > pending > rejected).
 */
export function publishStatusFor(
  procedureId: string,
  globals: readonly GlobalProcedure[]
): PublishStatus | null {
  const rank: Record<PublishStatus, number> = { approved: 2, pending: 1, rejected: 0 };
  let best: PublishStatus | null = null;
  for (const g of globals) {
    if (g.sourceProcedureId !== procedureId) continue;
    const status = (g.status ?? "approved") as PublishStatus;
    if (best === null || rank[status] > rank[best]) best = status;
  }
  return best;
}

function normalizeForMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Loosely find a personal procedure that looks like the same real-world
 * procedure as `global` — same normalized title, and matching brand/model
 * whenever both sides have one set. Used to catch content that was written
 * independently (by this user or someone else) rather than cloned/submitted
 * through the tracked `sourceGlobalId`/`sourceProcedureId` links.
 */
function findLikelyDuplicate(
  global: GlobalProcedure,
  personal: readonly Procedure[]
): Procedure | null {
  const gTitle = normalizeForMatch(global.title);
  const gBrand = (global.brand ?? "").trim().toLowerCase();
  const gModel = (global.model ?? "").trim().toLowerCase();
  return (
    personal.find((p) => {
      if (normalizeForMatch(p.title) !== gTitle) return false;
      const pBrand = (p.brand ?? "").trim().toLowerCase();
      const pModel = (p.model ?? "").trim().toLowerCase();
      if (gBrand && pBrand && gBrand !== pBrand) return false;
      if (gModel && pModel && gModel !== pModel) return false;
      return true;
    }) ?? null
  );
}

export type GlobalProcedureRelation =
  /** Already cloned into the personal library (forward `sourceGlobalId` link). */
  | { kind: "owned-cloned" }
  /** This global entry originated from one of the user's own personal procedures. */
  | { kind: "owned-published" }
  /** Untracked, but same title/brand/model AND same content — nothing to duplicate. */
  | { kind: "identical"; match: Procedure }
  /** Untracked, same title/brand/model but content differs — needs a decision. */
  | { kind: "differs"; match: Procedure }
  /** No relation to anything the user already has — safe to clone. */
  | { kind: "new" };

/**
 * How a global preset relates to the user's personal library. Checks tracked
 * links first (clone / publish), then falls back to a loose title+content
 * match so untracked duplicates (independently authored, same procedure)
 * aren't silently re-copied either — only genuinely new content is "new".
 */
export function classifyGlobalProcedure(
  global: GlobalProcedure,
  personal: readonly Procedure[]
): GlobalProcedureRelation {
  if (personal.some((p) => p.sourceGlobalId === global.id)) return { kind: "owned-cloned" };
  if (global.sourceProcedureId && personal.some((p) => p.id === global.sourceProcedureId)) {
    return { kind: "owned-published" };
  }
  const match = findLikelyDuplicate(global, personal);
  if (!match) return { kind: "new" };
  const sameContent =
    procedureHtmlToText(match.content ?? "").trim() === procedureHtmlToText(global.content ?? "").trim();
  return sameContent ? { kind: "identical", match } : { kind: "differs", match };
}

/** Lowercase haystack for title, content, brand, model, category, tags. */
export function procedureSearchHaystack(p: ProcedureLike): string {
  return [
    p.title,
    p.brand ?? "",
    p.model ?? "",
    p.category,
    (p.tags ?? []).join(" "),
    procedureHtmlToText(p.content ?? "")
  ]
    .join(" ")
    .toLowerCase();
}
