import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runUnoErpSync } from "@/lib/unoerp/sync";

const MIN_INTERVAL_MS = 5 * 60 * 1000;

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: creds } = await supabase
    .from("wf_unoerp_credentials")
    .select("last_sync_at, last_sync_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creds) return NextResponse.json({ error: "not_connected" }, { status: 400 });

  if (creds.last_sync_status === "running") {
    return NextResponse.json({ error: "already_running" }, { status: 409 });
  }

  if (creds.last_sync_at) {
    const elapsedMs = Date.now() - new Date(creds.last_sync_at as string).getTime();
    if (elapsedMs < MIN_INTERVAL_MS) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterSec: Math.ceil((MIN_INTERVAL_MS - elapsedMs) / 1000) },
        { status: 429 }
      );
    }
  }

  // Runs detached from this request/response cycle — use the service-role
  // client rather than the per-request cookie-bound one, since the latter
  // isn't safe to keep using once the response below has been sent.
  const service = createSupabaseServiceClient();
  if (!service) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  void runUnoErpSync(service, user.id);

  return NextResponse.json({ started: true });
}
