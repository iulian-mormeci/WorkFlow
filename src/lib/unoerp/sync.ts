import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/unoerp/crypto";
import { fetchAllMieProgrammate } from "@/lib/unoerp/client";
import { mapUnoErpActivity } from "@/lib/unoerp/mapping";

const SYNC_TOTAL_TIMEOUT_MS = 5 * 60 * 1000;

export type UnoErpSyncResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("sync_timeout")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function performSync(
  supabase: SupabaseClient,
  userId: string,
  baseUrl: string,
  tokenEncrypted: string,
  tokenIv: string
): Promise<{ count: number }> {
  const auth = decryptToken(tokenEncrypted, tokenIv);
  const rawRows = await fetchAllMieProgrammate(baseUrl, auth);

  const mapped = rawRows.map(mapUnoErpActivity).filter((m): m is NonNullable<typeof m> => m !== null);
  const seenUnoErpIds = new Set(mapped.map((m) => m.unoerpId));

  for (const m of mapped) {
    const { error } = await supabase.from("wf_unoerp_events").upsert(
      {
        user_id: userId,
        unoerp_id: m.unoerpId,
        title: m.title,
        start_at: m.startAt.toISOString(),
        end_at: m.endAt.toISOString(),
        all_day: m.allDay,
        description: m.description ?? null,
        subtitle: m.subtitle ?? null,
        color: m.color ?? null,
        category: m.category ?? null,
        priority: m.priority ?? null,
        ticket_type: m.ticketType ?? null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,unoerp_id" }
    );
    if (error) throw new Error(`wf_unoerp_events upsert: ${error.message}`);
  }

  // Anything for this user no longer present in this sync's response was
  // removed/closed on the ERP side — drop the local mirror row too.
  const { data: existing, error: existingError } = await supabase
    .from("wf_unoerp_events")
    .select("id, unoerp_id")
    .eq("user_id", userId);
  if (existingError) throw new Error(`wf_unoerp_events read: ${existingError.message}`);

  const staleIds = (existing ?? [])
    .filter((row: { unoerp_id: string }) => !seenUnoErpIds.has(row.unoerp_id))
    .map((row: { id: string }) => row.id);

  if (staleIds.length) {
    const { error: deleteError } = await supabase.from("wf_unoerp_events").delete().in("id", staleIds);
    if (deleteError) throw new Error(`wf_unoerp_events delete: ${deleteError.message}`);
  }

  return { count: mapped.length };
}

/**
 * Runs one full sync for a single user: fetch `mie__programmate` from
 * UnoERP, upsert into `wf_unoerp_events`, delete stale rows. Updates
 * `wf_unoerp_credentials` status/count/error throughout. Shared by the
 * on-demand `/api/unoerp/sync` route (user's own session client) and the
 * hourly cron (service-role client, iterating every connected user).
 */
export async function runUnoErpSync(supabase: SupabaseClient, userId: string): Promise<UnoErpSyncResult> {
  const { data: creds, error: credsError } = await supabase
    .from("wf_unoerp_credentials")
    .select("base_url, token_encrypted, token_iv")
    .eq("user_id", userId)
    .maybeSingle();

  if (credsError || !creds) {
    return { ok: false, error: "not_connected" };
  }

  await supabase.from("wf_unoerp_credentials").update({ last_sync_status: "running" }).eq("user_id", userId);

  try {
    const result = await withTimeout(
      performSync(supabase, userId, creds.base_url, creds.token_encrypted, creds.token_iv),
      SYNC_TOTAL_TIMEOUT_MS
    );

    await supabase
      .from("wf_unoerp_credentials")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
        last_sync_count: result.count,
        last_sync_error: null
      })
      .eq("user_id", userId);

    return { ok: true, count: result.count };
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await supabase
      .from("wf_unoerp_credentials")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "error",
        last_sync_error: message
      })
      .eq("user_id", userId);
    return { ok: false, error: message };
  }
}

/** Removes every synced event and the stored credentials for this user. */
export async function disconnectUnoErp(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error: eventsError } = await supabase.from("wf_unoerp_events").delete().eq("user_id", userId);
  if (eventsError) throw new Error(`wf_unoerp_events delete: ${eventsError.message}`);
  const { error: credsError } = await supabase.from("wf_unoerp_credentials").delete().eq("user_id", userId);
  if (credsError) throw new Error(`wf_unoerp_credentials delete: ${credsError.message}`);
}
