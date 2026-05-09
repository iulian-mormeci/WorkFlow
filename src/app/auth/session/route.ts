import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const access_token = body?.access_token;
  const refresh_token = body?.refresh_token;

  if (!access_token || !refresh_token) {
    return NextResponse.json({ ok: false, error: "Missing tokens" }, { status: 400 });
  }

  // This will set the Supabase auth cookies on the response via @supabase/ssr.
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

