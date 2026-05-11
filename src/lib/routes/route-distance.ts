import { haversineKm } from "@/lib/geo/haversine-km";
import type { InterventionGeoStop } from "@/lib/db/workflow-db";
import type { RouteStopDraft } from "@/lib/routes/route-stops";

function toGeo(s: RouteStopDraft): { lat: number; lng: number } | null {
  if (typeof s.lat !== "number" || typeof s.lng !== "number") return null;
  return { lat: s.lat, lng: s.lng };
}

/** Sum of haversine legs (straight-line approx). */
export function totalKmFromRouteStops(stops: RouteStopDraft[]): number {
  const geo = stops.map(toGeo).filter(Boolean) as { lat: number; lng: number }[];
  if (geo.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < geo.length - 1; i += 1) sum += haversineKm(geo[i], geo[i + 1]);
  return sum;
}

/**
 * Maps ordered draft route stops → intervention `startLocation` / `endLocation` / `locationKmAuto`
 * (same semantics as `RouteStopsEditor` map preview). Used on save because the create form hides
 * `InterventionLocationFields` whenever draft stops are shown.
 */
export function interventionEndpointsFromRouteStopDrafts(stops: RouteStopDraft[]): {
  startLocation?: InterventionGeoStop;
  endLocation?: InterventionGeoStop;
  locationKmAuto?: number;
} {
  const ordered = [...stops].sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  const geoStops: InterventionGeoStop[] = [];
  for (const s of ordered) {
    const g = toGeo(s);
    if (!g) continue;
    geoStops.push({
      address: (s.address ?? "").trim() || `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`,
      lat: g.lat,
      lng: g.lng
    });
  }
  if (geoStops.length === 0) return {};
  const startLocation = geoStops[0];
  const endLocation = geoStops.length > 1 ? geoStops[geoStops.length - 1] : undefined;
  const km = totalKmFromRouteStops(ordered);
  const locationKmAuto = km > 0 ? km : undefined;
  return { startLocation, endLocation, locationKmAuto };
}
