import { NextResponse } from "next/server";

/**
 * Optional Google Distance Matrix (driving). Falls back to client Haversine when unset.
 */
export async function POST(req: Request) {
  const key = process.env.GOOGLE_MAPS_DISTANCE_MATRIX_KEY;
  const body = (await req.json()) as {
    origins?: { lat: number; lng: number };
    destinations?: { lat: number; lng: number };
  };
  const o = body.origins;
  const d = body.destinations;
  if (!o || !d || !Number.isFinite(o.lat) || !Number.isFinite(o.lng)) {
    return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
  }
  if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) {
    return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
  }

  if (!key) {
    return NextResponse.json({ ok: false, mode: "none" });
  }

  const origin = `${o.lat},${o.lng}`;
  const dest = `${d.lat},${d.lng}`;
  const u = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  u.searchParams.set("origins", origin);
  u.searchParams.set("destinations", dest);
  u.searchParams.set("mode", "driving");
  u.searchParams.set("key", key);

  const res = await fetch(u.toString(), { cache: "no-store" });
  const j = (await res.json()) as {
    status?: string;
    rows?: { elements?: { status?: string; distance?: { value?: number } }[] }[];
  };
  if (j.status !== "OK" || !j.rows?.[0]?.elements?.[0]) {
    return NextResponse.json({ ok: false, mode: "google_error", detail: j.status });
  }
  const el = j.rows[0].elements[0];
  const meters = el.distance?.value;
  if (typeof meters !== "number") {
    return NextResponse.json({ ok: false, mode: "google_no_distance" });
  }
  const km = Math.round((meters / 1000) * 100) / 100;
  return NextResponse.json({ ok: true, mode: "google", km });
}
