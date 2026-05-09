import type { InterventionGeoStop } from "@/lib/db/workflow-db";

export function interventionStaticMapUrl(
  start?: InterventionGeoStop,
  end?: InterventionGeoStop
): string | null {
  if (!start) return null;
  const center = end
    ? `${(start.lat + end.lat) / 2},${(start.lng + end.lng) / 2}`
    : `${start.lat},${start.lng}`;
  let markers = `${start.lat},${start.lng},red-pushpin`;
  if (end) markers += `|${end.lat},${end.lng},blue-pushpin`;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${center}&zoom=12&size=520x220&markers=${markers}`;
}
