import { haversineKm } from "@/lib/geo/haversine-km";
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
  for (let i = 0; i < geo.length - 1; i++) sum += haversineKm(geo[i], geo[i + 1]);
  return sum;
}
