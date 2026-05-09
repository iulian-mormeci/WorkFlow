import type { SupabaseClient } from "@supabase/supabase-js";
import { applyRealtimePostgresChange } from "@/lib/sync/sync-engine";

/** Core user data only — omit low-signal tables (e.g. outbox) to reduce channel load. */
const TABLES = [
  "wf_clients",
  "wf_spare_parts",
  "wf_attachments",
  "wf_interventions",
  "wf_stock_movements",
  "wf_tickets",
  "wf_documents",
  "wf_templates"
] as const;

export type WorkflowRealtimeStop = () => void;

/**
 * One Realtime channel with multiple `postgres_changes` listeners (efficient vs N channels).
 */
export function startWorkflowRealtime(
  supabase: SupabaseClient,
  userId: string
): WorkflowRealtimeStop {
  const channel = supabase.channel(`workflow-db:${userId}`);

  const handler = (payload: {
    eventType: string;
    new: Record<string, unknown> | null;
    old: Record<string, unknown> | null;
    table?: string;
  }) => {
    const table = payload.table;
    if (!table || !(TABLES as readonly string[]).includes(table)) return;
    void applyRealtimePostgresChange(supabase, userId, {
      eventType: payload.eventType,
      new: payload.new,
      old: payload.old,
      table
    });
  };

  for (const t of TABLES) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: t,
        filter: `user_id=eq.${userId}`
      },
      handler
    );
  }

  channel.subscribe((status, err) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.warn("[realtime] channel issue", status, err?.message);
    }
  });

  return () => {
    void supabase.removeChannel(channel);
  };
}
