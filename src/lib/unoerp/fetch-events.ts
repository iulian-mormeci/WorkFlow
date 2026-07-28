import type { SupabaseClient } from "@supabase/supabase-js";
import type { UnoErpCalendarEvent } from "@/stores/unoerp-events";

type UnoErpEventRow = {
  id: string;
  unoerp_id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  color: string | null;
  category: string | null;
  priority: string | null;
  ticket_type: string | null;
};

function fromRow(row: UnoErpEventRow): UnoErpCalendarEvent {
  return {
    id: row.id,
    unoerpId: row.unoerp_id,
    title: row.title,
    subtitle: row.subtitle ?? undefined,
    description: row.description ?? undefined,
    start: new Date(row.start_at),
    end: new Date(row.end_at),
    allDay: row.all_day,
    color: row.color ?? undefined,
    category: row.category ?? undefined,
    priority: row.priority ?? undefined,
    ticketType: row.ticket_type ?? undefined
  };
}

/** Direct (RLS-protected) client read of the signed-in user's synced UnoERP events. */
export async function fetchUnoErpEvents(
  supabase: SupabaseClient,
  userId: string
): Promise<UnoErpCalendarEvent[]> {
  const { data } = await supabase
    .from("wf_unoerp_events")
    .select(
      "id, unoerp_id, title, subtitle, description, start_at, end_at, all_day, color, category, priority, ticket_type"
    )
    .eq("user_id", userId);
  return ((data ?? []) as UnoErpEventRow[]).map(fromRow);
}
