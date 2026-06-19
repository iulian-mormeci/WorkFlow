import { NextResponse } from "next/server";

export type GeocodeHit = {
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
  rawLabel?: string;
};

type AutocompletePrediction = {
  description?: string;
  place_id?: string;
};

type PlaceDetailsResult = {
  status?: string;
  result?: {
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  };
};

type GeocodingResult = {
  status?: string;
  results?: {
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
    place_id?: string;
  }[];
};

const GOOGLE_KEY = process.env.GOOGLE_MAPS_DISTANCE_MATRIX_KEY ?? "";
const UA = "WorkFlowPWA/1.0 (field-service; geocode)";

/** Google Places Autocomplete → array of {address, placeId} (no coordinates yet). */
async function googleAutocomplete(q: string): Promise<GeocodeHit[]> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", q);
  url.searchParams.set("key", GOOGLE_KEY);
  url.searchParams.set("language", "it");
  url.searchParams.set("types", "address");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`autocomplete ${res.status}`);

  const json = (await res.json()) as { status?: string; predictions?: AutocompletePrediction[] };
  // Google returns HTTP 200 even for auth/quota errors — treat anything other than OK/ZERO_RESULTS as a failure.
  if (json.status && json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    throw new Error(`autocomplete status: ${json.status}`);
  }

  const predictions = json.predictions ?? [];

  return predictions
    .filter((p) => p.description && p.place_id)
    .map((p) => ({
      address: String(p.description),
      placeId: String(p.place_id),
      lat: 0,
      lng: 0
    }));
}

/** Google Place Details → resolves placeId to {address, lat, lng}. Throws on API errors so caller can fall back. */
async function googlePlaceDetails(placeId: string): Promise<GeocodeHit | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("key", GOOGLE_KEY);
  url.searchParams.set("fields", "formatted_address,geometry");
  url.searchParams.set("language", "it");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`place details ${res.status}`);

  const json = (await res.json()) as PlaceDetailsResult;
  if (json.status && json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    throw new Error(`place details status: ${json.status}`);
  }
  if (json.status !== "OK" || !json.result) return null;

  const lat = json.result.geometry?.location?.lat;
  const lng = json.result.geometry?.location?.lng;
  const address = json.result.formatted_address;
  if (!address || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { address, lat: lat!, lng: lng!, placeId };
}

/** Google Geocoding Reverse (lat/lng → address). Throws on API errors so caller can fall back. */
async function googleReverseGeocode(lat: number, lng: number): Promise<GeocodeHit | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", GOOGLE_KEY);
  url.searchParams.set("language", "it");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`reverse geocode ${res.status}`);

  const json = (await res.json()) as GeocodingResult;
  if (json.status && json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    throw new Error(`reverse geocode status: ${json.status}`);
  }
  if (json.status !== "OK" || !json.results?.length) return null;

  const r = json.results[0];
  const rLat = r.geometry?.location?.lat;
  const rLng = r.geometry?.location?.lng;
  if (!Number.isFinite(rLat) || !Number.isFinite(rLng)) return null;

  return {
    address: r.formatted_address ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    lat: rLat!,
    lng: rLng!,
    placeId: r.place_id
  };
}

/** Nominatim fallback (no API key required). */
async function nominatimSearch(q: string): Promise<GeocodeHit[]> {
  const nom = new URL("https://nominatim.openstreetmap.org/search");
  nom.searchParams.set("format", "json");
  nom.searchParams.set("q", q);
  nom.searchParams.set("limit", "10");
  nom.searchParams.set("addressdetails", "1");

  const res = await fetch(nom.toString(), {
    headers: { "User-Agent": UA },
    cache: "no-store"
  });
  if (!res.ok) return [];

  const rows = (await res.json()) as { display_name?: string; lat?: string; lon?: string }[];
  return (rows ?? [])
    .map((r) => {
      const la = Number(r.lat);
      const lo = Number(r.lon);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
      return {
        address: String(r.display_name ?? "").trim() || `${la}, ${lo}`,
        lat: la,
        lng: lo
      };
    })
    .filter((x): x is GeocodeHit => x !== null);
}

/** Nominatim reverse fallback. */
async function nominatimReverse(lat: number, lng: number): Promise<GeocodeHit | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "json");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "18");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": UA },
    cache: "no-store"
  });
  if (!res.ok) return null;

  const j = (await res.json()) as { display_name?: string; lat?: string; lon?: string };
  const address = String(j.display_name ?? "").trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return { address, lat: Number(j.lat ?? lat), lng: Number(j.lon ?? lng) };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const placeId = url.searchParams.get("placeId")?.trim();
  const latParam = url.searchParams.get("lat");
  const lonParam = url.searchParams.get("lon");

  try {
    // ── Resolve a specific place ID to coordinates ──────────────────────────
    if (placeId) {
      if (GOOGLE_KEY) {
        try {
          const hit = await googlePlaceDetails(placeId);
          if (hit) return NextResponse.json([hit]);
        } catch { /* fall through to Nominatim */ }
      }
      // placeId cannot be resolved by Nominatim — return empty
      return NextResponse.json([]);
    }

    // ── Reverse geocoding (coordinates → address) ───────────────────────────
    if (latParam != null && lonParam != null) {
      const la = Number(latParam);
      const lo = Number(lonParam);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        return NextResponse.json({ error: "invalid coordinates" }, { status: 400 });
      }
      if (GOOGLE_KEY) {
        try {
          const hit = await googleReverseGeocode(la, lo);
          if (hit) return NextResponse.json([hit]);
        } catch { /* fall through to Nominatim */ }
      }
      const hit = await nominatimReverse(la, lo);
      return NextResponse.json(hit ? [hit] : []);
    }

    // ── Text search (address autocomplete) ──────────────────────────────────
    if (!q || q.length < 3) {
      return NextResponse.json([]);
    }

    if (GOOGLE_KEY) {
      try {
        const hits = await googleAutocomplete(q);
        if (hits.length > 0) return NextResponse.json(hits);
      } catch { /* fall through to Nominatim */ }
    }

    const hits = await nominatimSearch(q);
    return NextResponse.json(hits);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "geocode failed" },
      { status: 500 }
    );
  }
}
