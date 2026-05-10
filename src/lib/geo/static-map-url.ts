import type { InterventionGeoStop } from "@/lib/db/workflow-db";

const DEFAULT_SIZE = "640x360";

export type StaticMapSize = { width: number; height: number };

function validCoord(s?: InterventionGeoStop): s is InterventionGeoStop {
  return (
    !!s &&
    Number.isFinite(s.lat) &&
    Number.isFinite(s.lng) &&
    Math.abs(s.lat) <= 90 &&
    Math.abs(s.lng) <= 180
  );
}

/** Bounding box "minLng,minLat,maxLng,maxLat" for fit. */
export function interventionMapBounds(
  start?: InterventionGeoStop,
  end?: InterventionGeoStop
): { south: number; west: number; north: number; east: number } | null {
  const pts = [start, end].filter(validCoord);
  if (pts.length === 0) return null;
  let south = pts[0].lat;
  let north = pts[0].lat;
  let west = pts[0].lng;
  let east = pts[0].lng;
  for (const p of pts) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
  }
  if (south === north && west === east) {
    const pad = 0.01;
    return { south: south - pad, north: north + pad, west: west - pad, east: east + pad };
  }
  const latPad = Math.max((north - south) * 0.15, 0.002);
  const lngPad = Math.max((east - west) * 0.15, 0.002);
  return {
    south: south - latPad,
    north: north + latPad,
    west: west - lngPad,
    east: east + lngPad
  };
}

/**
 * Legacy static bitmap URL (openstreetmap.de) — often blocked or degraded; prefer
 * {@link InterventionRouteMapPreview} with Leaflet + OSM tiles.
 * @deprecated
 */
export function interventionStaticMapUrl(
  start?: InterventionGeoStop,
  end?: InterventionGeoStop
): string | null {
  if (!validCoord(start)) return null;
  const center = end && validCoord(end)
    ? `${(start.lat + end.lat) / 2},${(start.lng + end.lng) / 2}`
    : `${start.lat},${start.lng}`;
  let markers = `${start.lat},${start.lng},red-pushpin`;
  if (end && validCoord(end)) markers += `|${end.lat},${end.lng},blue-pushpin`;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${center}&zoom=12&size=${DEFAULT_SIZE}&markers=${markers}`;
}

/** Google Static Maps URL (server-side only; key must allow Static Maps API). */
export function googleInterventionStaticMapUrl(
  start: InterventionGeoStop,
  end: InterventionGeoStop | undefined,
  apiKey: string,
  size: StaticMapSize = { width: 640, height: 360 }
): string {
  const q = [
    `size=${size.width}x${size.height}`,
    `scale=2`,
    `maptype=roadmap`,
    `key=${encodeURIComponent(apiKey)}`,
    `markers=color:0x15803d|${start.lat},${start.lng}`
  ];
  if (end && validCoord(end)) {
    q.push(`markers=color:0x1d4ed8|${end.lat},${end.lng}`);
    q.push(
      `path=color:0x2563eb|weight:4|${start.lat},${start.lng}|${end.lat},${end.lng}`
    );
  }
  return `https://maps.googleapis.com/maps/api/staticmap?${q.join("&")}`;
}

/** Next.js proxy path (streams PNG from Google if key configured). Else callers use Leaflet. */
export function interventionStaticMapProxyPath(
  start?: InterventionGeoStop,
  end?: InterventionGeoStop
): string | null {
  if (!validCoord(start)) return null;
  const p = new URLSearchParams();
  p.set("sLat", String(start.lat));
  p.set("sLng", String(start.lng));
  if (end && validCoord(end)) {
    p.set("eLat", String(end.lat));
    p.set("eLng", String(end.lng));
  }
  return `/api/map-static?${p.toString()}`;
}
