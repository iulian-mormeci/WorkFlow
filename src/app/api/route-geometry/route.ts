import { NextResponse } from "next/server";

type LatLng = { lat: number; lng: number };

type Body = {
  origin?: LatLng;
  destination?: LatLng;
  /** Ordered driving stops (≥2). Preferred when set — draws full path through all points. */
  waypoints?: LatLng[];
};

function normalizePoints(body: Body): LatLng[] | null {
  if (Array.isArray(body.waypoints) && body.waypoints.length >= 2) {
    const pts = body.waypoints.filter(
      (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    );
    return pts.length >= 2 ? pts : null;
  }
  const o = body.origin;
  const d = body.destination;
  if (
    o &&
    d &&
    Number.isFinite(o.lat) &&
    Number.isFinite(o.lng) &&
    Number.isFinite(d.lat) &&
    Number.isFinite(d.lng)
  ) {
    return [o, d];
  }
  return null;
}

/**
 * Proxies OSRM public demo router (no API key). Coordinates suitable for Leaflet polylines [lat,lng][].
 * Supports `waypoints` (full multi-stop) or legacy `origin` + `destination`.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const pts = normalizePoints(body);
  if (!pts || pts.length < 2) {
    return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
  }

  const path = pts.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`;

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
