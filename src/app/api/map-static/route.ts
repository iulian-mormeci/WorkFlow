import { NextResponse } from "next/server";
import { googleInterventionStaticMapUrl } from "@/lib/geo/static-map-url";
import type { InterventionGeoStop } from "@/lib/db/workflow-db";

/**
 * Proxies Google Static Maps when GOOGLE_MAPS_STATIC_KEY (or GOOGLE_MAPS_API_KEY) is set.
 * Optional fallback for clients that prefer an <img> over Leaflet.
 */
export async function GET(req: Request) {
  const key =
    process.env.GOOGLE_MAPS_STATIC_KEY ?? process.env.GOOGLE_MAPS_API_KEY ?? "";
  const url = new URL(req.url);
  const sLat = Number(url.searchParams.get("sLat"));
  const sLng = Number(url.searchParams.get("sLng"));
  const eLat = url.searchParams.get("eLat");
  const eLng = url.searchParams.get("eLng");

  if (!key || !Number.isFinite(sLat) || !Number.isFinite(sLng)) {
    return NextResponse.json(
      { error: "Missing static map key or invalid start coordinates" },
      { status: 404 }
    );
  }

  const start: InterventionGeoStop = {
    address: "",
    lat: sLat,
    lng: sLng
  };
  let end: InterventionGeoStop | undefined;
  if (eLat != null && eLng != null) {
    const la = Number(eLat);
    const lo = Number(eLng);
    if (Number.isFinite(la) && Number.isFinite(lo)) {
      end = { address: "", lat: la, lng: lo };
    }
  }

  try {
    const staticUrl = googleInterventionStaticMapUrl(start, end, key);
    const upstream = await fetch(staticUrl, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: 502 }
      );
    }
    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "image/png",
        "Cache-Control": "public, max-age=300"
      }
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 }
    );
  }
}
