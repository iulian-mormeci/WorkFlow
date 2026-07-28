import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authenticateUnoErp } from "@/lib/unoerp/client";
import { encryptToken } from "@/lib/unoerp/crypto";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { baseUrl?: string; username?: string; password?: string }
    | null;
  const baseUrl = body?.baseUrl?.trim().replace(/\/+$/, "");
  const username = body?.username?.trim();
  const password = body?.password ?? "";

  if (!baseUrl || !username || !password) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  if (!/^https:\/\//i.test(baseUrl)) {
    return NextResponse.json({ error: "https_required" }, { status: 400 });
  }

  const result = await authenticateUnoErp(baseUrl, username, password);
  if (!result.ok) {
    return NextResponse.json({ error: "auth_failed" }, { status: 401 });
  }

  const { encrypted, iv } = encryptToken(result.auth);
  const nowIso = new Date().toISOString();

  const { error } = await supabase.from("wf_unoerp_credentials").upsert(
    {
      user_id: user.id,
      base_url: baseUrl,
      token_encrypted: encrypted,
      token_iv: iv,
      last_auth_at: nowIso,
      last_sync_status: null,
      last_sync_error: null
    },
    { onConflict: "user_id" }
  );

  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  return NextResponse.json({ success: true });
}
