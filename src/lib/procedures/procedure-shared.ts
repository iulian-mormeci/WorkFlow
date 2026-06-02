import type { GlobalProcedure, Procedure, ProcedureCategory } from "@/lib/db/workflow-db";
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
