import { NextResponse } from "next/server";
import { runUnoErpCronSync } from "@/lib/unoerp/cron";

/**
 * Triggered by the hourly schedule in `src/instrumentation.ts` (loopback
 * call), not by any user. Authenticated with a shared secret instead of a
 * user session — this runs the sync across every connected user via the
 * service-role client.
 */
export async function POST(req: Request) {
  const secret = process.env.UNOERP_CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  void runUnoErpCronSync();
  return NextResponse.json({ started: true });
}
