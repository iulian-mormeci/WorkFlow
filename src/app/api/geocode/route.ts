import { NextResponse } from "next/server";

const UA = "WorkFlowPWA/1.0 (field-service; geocode)";

export type GeocodeHit = {
  address: string;
  lat: number;
  lng: number;
  rawLabel?: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");

  try {
    if (lat != null && lon != null) {
      const la = Number(lat);
      const lo = Number(lon);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        return NextResponse.json({ error: "invalid coordinates" }, { status: 400 });
      }
      const rev = new URL("https://nominatim.openstreetmap.org/reverse");
      rev.searchParams.set("format", "json");
      rev.searchParams.set("lat", String(la));
      rev.searchParams.set("lon", String(lo));
      rev.searchParams.set("zoom", "18");
      const res = await fetch(rev.toString(), {
        headers: { "User-Agent": UA },
        cache: "no-store"
      });
      if (!res.ok) {
        return NextResponse.json({ error: `reverse ${res.status}` }, { status: 502 });
      }
      const j = (await res.json()) as {
        display_name?: string;
        lat?: string;
        lon?: string;
      };
      const address = String(j.display_name ?? "").trim() || `${la.toFixed(5)}, ${lo.toFixed(5)}`;
      const out: GeocodeHit = {
        address,
        lat: Number(j.lat ?? la),
        lng: Number(j.lon ?? lo),
        rawLabel: j.display_name
      };
      return NextResponse.json([out]);
    }

    if (!q || q.length < 2) {
      return NextResponse.json([], { status: 200 });
    }

    const nom = new URL("https://nominatim.openstreetmap.org/search");
    nom.searchParams.set("format", "json");
    nom.searchParams.set("q", q);
    nom.searchParams.set("limit", "10");
    const res = await fetch(nom.toString(), {
      headers: { "User-Agent": UA },
      cache: "no-store"
    });
    if (!res.ok) {
      return NextResponse.json({ error: `search ${res.status}` }, { status: 502 });
    }
    const rows = (await res.json()) as {
      display_name?: string;
      lat?: string;
      lon?: string;
    }[];
    const hits: GeocodeHit[] = (rows ?? [])
      .map((r) => {
        const la = Number(r.lat);
        const lo = Number(r.lon);
        if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
        const address = String(r.display_name ?? "").trim() || `${la}, ${lo}`;
        return { address, lat: la, lng: lo, rawLabel: r.display_name };
      })
      .filter(Boolean) as GeocodeHit[];

    return NextResponse.json(hits);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "geocode failed" },
      { status: 500 }
    );
  }
}
