/**
 * Deep links for multi-stop driving directions.
 * Apple Maps: chained `daddr` segments (`lat,lng+to:lat,lng`).
 * Google Maps: Directions API URL with origin, waypoints, destination.
 */

import type { RouteStopDraft } from "@/lib/routes/route-stops";
import type { Intervention } from "@/lib/db/workflow-db";

export type RouteStopForMaps = {
  label?: string;
  address?: string;
  lat?: number;
  lng?: number;
};

export function routeStopDraftsToMapStops(stops: RouteStopDraft[]): RouteStopForMaps[] {
  return [...stops]
    .sort((a, b) => a.sortIndex - b.sortIndex)
    .map((s) => ({
      label: s.label,
      address: s.address,
      lat: s.lat,
      lng: s.lng
    }));
}

/** Fallback when Supabase stops are empty: use saved start / end geocoding. */
export function interventionEndpointsToMapStops(intervention: Pick<Intervention, "startLocation" | "endLocation">): RouteStopForMaps[] {
  const out: RouteStopForMaps[] = [];
  if (intervention.startLocation) {
    out.push({
      address: intervention.startLocation.address,
      lat: intervention.startLocation.lat,
      lng: intervention.startLocation.lng
    });
  }
  if (intervention.endLocation) {
    out.push({
      address: intervention.endLocation.address,
      lat: intervention.endLocation.lat,
      lng: intervention.endLocation.lng
    });
  }
  return out;
}

/** Prefer Apple Maps on iPad / iPhone / iPadOS desktop mode. */
export function prefersAppleMaps(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ may report as MacIntel with touch
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  return false;
}

function hasCoords(s: RouteStopForMaps): s is RouteStopForMaps & { lat: number; lng: number } {
  return typeof s.lat === "number" && typeof s.lng === "number" && Number.isFinite(s.lat) && Number.isFinite(s.lng);
}

/** Encode one segment for Apple `daddr` chain (coords or place name). */
function appleSegment(s: RouteStopForMaps): string {
  if (hasCoords(s)) {
    return `${s.lat},${s.lng}`;
  }
  const t = (s.address ?? s.label ?? "").trim();
  return t;
}

/**
 * Apple Maps: multiple stops via `daddr=lat,lng+to:lat,lng+to:...`
 * @see https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html
 */
export function buildAppleMapsDirectionsUrl(stops: RouteStopForMaps[]): string | null {
  const usable = stops.map(appleSegment).filter(Boolean);
  if (usable.length < 2) return null;
  const daddr = usable.join("+to:");
  return `https://maps.apple.com/?dirflg=d&daddr=${encodeURIComponent(daddr)}`;
}

/**
 * Google Maps Directions with all legs (waypoints between first and last).
 */
export function buildGoogleMapsDirectionsUrl(stops: RouteStopForMaps[]): string | null {
  const coords = stops.filter(hasCoords);
  if (coords.length >= 2) {
    const origin = `${coords[0].lat},${coords[0].lng}`;
    const destination = `${coords[coords.length - 1].lat},${coords[coords.length - 1].lng}`;
    const u = new URL("https://www.google.com/maps/dir/?api=1");
    u.searchParams.set("origin", origin);
    u.searchParams.set("destination", destination);
    if (coords.length > 2) {
      const waypoints = coords
        .slice(1, -1)
        .map((s) => `${s.lat},${s.lng}`)
        .join("|");
      u.searchParams.set("waypoints", waypoints);
    }
    u.searchParams.set("travelmode", "driving");
    return u.toString();
  }

  // Address-only fallback: path-style dir
  const parts = stops
    .map((s) => (s.address ?? s.label ?? "").trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const path = parts.map((p) => encodeURIComponent(p)).join("/");
  return `https://www.google.com/maps/dir/${path}`;
}

export function buildBestMapsDirectionsUrl(stops: RouteStopForMaps[]): string | null {
  const cleaned = stops.filter((s) => hasCoords(s) || (s.address ?? s.label ?? "").trim());
  if (cleaned.length < 2) return null;
  if (prefersAppleMaps()) {
    const apple = buildAppleMapsDirectionsUrl(cleaned);
    if (apple) return apple;
  }
  return buildGoogleMapsDirectionsUrl(cleaned) ?? buildAppleMapsDirectionsUrl(cleaned);
}

export function openRouteInNavigator(stops: RouteStopForMaps[], opts?: { newTab?: boolean }): boolean {
  const url = buildBestMapsDirectionsUrl(stops);
  if (!url) return false;
  if (opts?.newTab === false) {
    window.location.href = url;
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return true;
}
