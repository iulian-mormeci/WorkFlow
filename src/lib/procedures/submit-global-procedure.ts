import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProcedureFormValues } from "@/lib/procedures/procedure-mutations";
import { sanitizeProcedureHtml } from "@/lib/procedures/sanitize-html";
import { isGlobalProcedureAdmin } from "@/lib/procedures/global-procedure-admin";

export type SubmitGlobalResult =
  | { ok: true; id: string; status: "approved" | "pending" }
  | { ok: false; error: string; code?: "ALREADY_SUBMITTED" | "ALREADY_APPROVED" };

/**
 * Inserts a copy of a procedure into wf_global_procedures.
 * Admins/trusted contributors publish directly (status=approved).
 * Regular users submit for review (status=pending).
 *
 * Returns { ok: false, code: "ALREADY_SUBMITTED" } if an active (pending or
 * approved) submission from the same user already exists for this source procedure.
 */
export async function submitProcedureForGlobal(
  values: ProcedureFormValues,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null },
  supabase: SupabaseClient,
  sourceProcedureId?: string
): Promise<SubmitGlobalResult> {
  const isAdmin = isGlobalProcedureAdmin(user);
  const isTrusted =
    isAdmin ||
    (user.user_metadata?.role as string | undefined) === "trusted_contributor";

  const status = isTrusted ? "approved" : "pending";

  // Check for an existing active submission from this user for the same source procedure.
  if (sourceProcedureId) {
    const { data: existing } = await supabase
      .from("wf_global_procedures")
      .select("id, status")
      .eq("created_by", user.id)
      .eq("source_procedure_id", sourceProcedureId)
      .in("status", ["pending", "approved"])
      .maybeSingle();

    if (existing) {
      const code = existing.status === "approved" ? "ALREADY_APPROVED" : "ALREADY_SUBMITTED";
      return { ok: false, error: code, code };
    }
  }

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
    source_procedure_id: sourceProcedureId ?? null,
    created_at: nowIso,
    updated_at: nowIso
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, id, status };
}
