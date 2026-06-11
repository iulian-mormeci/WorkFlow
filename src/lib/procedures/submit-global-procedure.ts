import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProcedureFormValues } from "@/lib/procedures/procedure-mutations";
import { sanitizeProcedureHtml } from "@/lib/procedures/sanitize-html";
import { isGlobalProcedureAdmin } from "@/lib/procedures/global-procedure-admin";

export type SubmitGlobalResult =
  | { ok: true; id: string; status: "approved" | "pending" }
  | { ok: false; error: string };

/**
 * Inserts a copy of a procedure into wf_global_procedures.
 * Admins/trusted contributors publish directly (status=approved).
 * Regular users submit for review (status=pending).
 */
export async function submitProcedureForGlobal(
  values: ProcedureFormValues,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null },
  supabase: SupabaseClient
): Promise<SubmitGlobalResult> {
  const isAdmin = isGlobalProcedureAdmin(user);
  const isTrusted =
    isAdmin ||
    (user.user_metadata?.role as string | undefined) === "trusted_contributor";

  const status = isTrusted ? "approved" : "pending";
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const { error } = await supabase.from("wf_global_procedures").insert({
    id,
    created_by: user.id,
    title: values.title.trim(),
    category: values.category,
    brand: values.brand?.trim() || null,
    model: values.model?.trim() || null,
    content: sanitizeProcedureHtml(values.content ?? "") || null,
    tags: values.tags.length ? values.tags : null,
    image_ids: values.imageIds.length ? values.imageIds : null,
    status,
    created_at: nowIso,
    updated_at: nowIso
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, id, status };
}
