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

/** IDs of global procedures already cloned into the personal library. */
export function clonedGlobalIdSet(personal: readonly Procedure[]): Set<string> {
  const set = new Set<string>();
  for (const p of personal) {
    if (p.sourceGlobalId) set.add(p.sourceGlobalId);
  }
  return set;
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
