import { NextResponse } from "next/server";

type Body = {
  origin?: { lat: number; lng: number };
  destination?: { lat: number; lng: number };
};

/**
 * Proxies OSRM public demo router (no API key). Coordinates suitable for Leaflet polylines [lat,lng][].
 */
export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const o = body.origin;
  const d = body.destination;
  if (
    !o ||
    !d ||
    !Number.isFinite(o.lat) ||
    !Number.isFinite(o.lng) ||
    !Number.isFinite(d.lat) ||
    !Number.isFinite(d.lng)
  ) {
    return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${o.lng},${o.lat};${d.lng},${d.lat}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "WorkFlowPWA/1.0 (route-preview)" },
      cache: "no-store",
      next: { revalidate: 0 }
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, mode: "osrm_http", status: res.status });
    }
    const j = (await res.json()) as {
      code?: string;
      routes?: { geometry?: { coordinates?: number[][] } }[];
    };
    if (j.code !== "Ok" || !j.routes?.[0]?.geometry?.coordinates?.length) {
      return NextResponse.json({ ok: false, mode: "osrm_no_route" });
    }
    const coords = j.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
    return NextResponse.json({ ok: true, mode: "driving", coordinates: coords });
  } catch {
    return NextResponse.json({ ok: false, mode: "osrm_error" });
  }
}
