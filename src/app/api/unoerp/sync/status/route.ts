import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: creds } = await supabase
    .from("wf_unoerp_credentials")
    .select("base_url, last_sync_at, last_sync_status, last_sync_count, last_sync_error")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creds) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: true,
    baseUrl: creds.base_url,
    lastSyncAt: creds.last_sync_at,
    lastSyncStatus: creds.last_sync_status,
    lastSyncCount: creds.last_sync_count,
    lastSyncError: creds.last_sync_error
  });
}
