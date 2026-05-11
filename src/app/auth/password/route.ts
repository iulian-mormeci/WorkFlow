import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getClientIp } from "@/lib/security/rate-limit";
import { logSecurityEvent } from "@/lib/security/security-log";

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const email = body?.email;
  const password = body?.password;
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Missing credentials" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      }
    }
  });

  const ip = getClientIp(req);
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      logSecurityEvent({
        event: "login_failed",
        ip,
        reason: error.message
      });
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
  } catch (e: unknown) {
    logSecurityEvent({
      event: "login_exception",
      ip,
      message: e instanceof Error ? e.message : String(e)
    });
    return NextResponse.json(
      { ok: false, error: "Sign-in service unavailable. Try again in a moment." },
      { status: 503 }
    );
  }

  return res;
}

