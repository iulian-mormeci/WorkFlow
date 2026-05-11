"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinOff } from "lucide-react";
import type { InterventionGeoStop } from "@/lib/db/workflow-db";
import { cn } from "@/lib/utils";
import type { LatLngTuple } from "leaflet";
import type { Map as LeafletMap } from "leaflet";
import { useTranslations } from "next-intl";
import { listRouteStops, subscribeRouteStops } from "@/lib/routes/route-stops";

type Props = {
  start?: InterventionGeoStop;
  end?: InterventionGeoStop;
  /** When ≥2 geo-valid points, draws one driving route through all (round trip / multi-stop). */
  waypoints?: InterventionGeoStop[];
  /** Load `wf_intervention_stops` when `waypoints` not supplied (intervention detail page). */
  interventionId?: string;
  variant?: "comfortable" | "compact";
  className?: string;
};

function geoOk(s?: InterventionGeoStop): s is InterventionGeoStop {
  return (
    !!s &&
    Number.isFinite(s.lat) &&
    Number.isFinite(s.lng) &&
    Math.abs(s.lat) <= 90 &&
    Math.abs(s.lng) <= 180
  );
}

function straightLineFallback(pts: InterventionGeoStop[]): LatLngTuple[] {
  return pts.map((p) => [p.lat, p.lng] as LatLngTuple);
}

async function fetchRouteGeometryWaypoints(pts: InterventionGeoStop[]): Promise<LatLngTuple[]> {
  if (pts.length < 2) return [];
  try {
    const res = await fetch("/api/route-geometry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        waypoints: pts.map((p) => ({ lat: p.lat, lng: p.lng }))
      })
    });
    const j = (await res.json()) as {
      ok?: boolean;
      coordinates?: LatLngTuple[];
    };
    if (j.ok && Array.isArray(j.coordinates) && j.coordinates.length > 1) {
      return j.coordinates.map(([lat, lng]) => [lat, lng] as LatLngTuple);
    }
  } catch {
    /* fall through */
  }
  return straightLineFallback(pts);
}

async function fetchRouteGeometryPair(a: InterventionGeoStop, b: InterventionGeoStop): Promise<LatLngTuple[]> {
  try {
    const res = await fetch("/api/route-geometry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: { lat: a.lat, lng: a.lng },
        destination: { lat: b.lat, lng: b.lng }
      })
    });
    const j = (await res.json()) as {
      ok?: boolean;
      coordinates?: LatLngTuple[];
    };
    if (j.ok && Array.isArray(j.coordinates) && j.coordinates.length > 1) {
      return j.coordinates.map(([lat, lng]) => [lat, lng] as LatLngTuple);
    }
  } catch {
    /* fall through */
  }
  return [
    [a.lat, a.lng],
    [b.lat, b.lng]
  ];
}

export function InterventionRouteMapPreview({
  start,
  end,
  waypoints,
  interventionId,
  variant = "comfortable",
  className
}: Props) {
  const t = useTranslations();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [imgFallback, setImgFallback] = useState<string | null>(null);
  const [serverWaypoints, setServerWaypoints] = useState<InterventionGeoStop[]>([]);

  useEffect(() => {
    if (!interventionId) {
      setServerWaypoints([]);
      return;
    }
    const id: string = interventionId;
    let cancelled = false;
    async function load() {
      const rows = await listRouteStops(id);
      const ordered = [...rows].sort((a, b) => a.sortIndex - b.sortIndex);
      const geo: InterventionGeoStop[] = [];
      for (const r of ordered) {
        if (typeof r.lat !== "number" || typeof r.lng !== "number") continue;
        geo.push({
          address: (r.address ?? "").trim() || `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`,
          lat: r.lat,
          lng: r.lng
        });
      }
      if (!cancelled) setServerWaypoints(geo);
    }
    void load();
    const unsub = subscribeRouteStops(id, () => {
      void load();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [interventionId]);

  const propPath = useMemo(() => (waypoints ?? []).filter(geoOk), [waypoints]);
  const serverPath = useMemo(() => serverWaypoints.filter(geoOk), [serverWaypoints]);

  const multiPath = useMemo(() => {
    if (propPath.length >= 2) return propPath;
    if (serverPath.length >= 2) return serverPath;
    return null;
  }, [propPath, serverPath]);

  const singleFromPath = useMemo(() => {
    if (multiPath) return null;
    if (propPath.length === 1) return propPath[0];
    if (serverPath.length === 1) return serverPath[0];
    return null;
  }, [multiPath, propPath, serverPath]);

  const okStart = geoOk(start);
  const okEnd = geoOk(end);
  const hasAny =
    (multiPath && multiPath.length > 0) ||
    !!singleFromPath ||
    okStart ||
    okEnd;

  const googleProxy = useMemo(() => {
    if (!hasAny) return null;
    if (multiPath && multiPath[0]) {
      const s = multiPath[0];
      const p = new URLSearchParams({ sLat: String(s.lat), sLng: String(s.lng) });
      const last = multiPath[multiPath.length - 1];
      if (last && (last.lat !== s.lat || last.lng !== s.lng)) {
        p.set("eLat", String(last.lat));
        p.set("eLng", String(last.lng));
      }
      return `/api/map-static?${p.toString()}`;
    }
    if (singleFromPath) {
      const p = new URLSearchParams({
        sLat: String(singleFromPath.lat),
        sLng: String(singleFromPath.lng)
      });
      return `/api/map-static?${p.toString()}`;
    }
    const s = okStart ? start! : okEnd ? end! : null;
    if (!s) return null;
    const p = new URLSearchParams({ sLat: String(s.lat), sLng: String(s.lng) });
    if (okStart && okEnd && start && end) {
      p.set("eLat", String(end.lat));
      p.set("eLng", String(end.lng));
    }
    return `/api/map-static?${p.toString()}`;
  }, [hasAny, multiPath, singleFromPath, okStart, okEnd, start, end]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!hasAny || !el) return;

    let cancelled = false;
    let map: LeafletMap | null = null;
    let resizeTimer: number | undefined;
    let ro: ResizeObserver | undefined;

    void (async () => {
      setError(null);
      setImgFallback(null);

      try {
        const L = await import("leaflet");

        delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
        });

        if (cancelled || !wrapRef.current) return;

        map = L.map(wrapRef.current, {
          attributionControl: true,
          zoomControl: true,
          scrollWheelZoom: false
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        const rpx = variant === "comfortable" ? 13 : 10;

        if (multiPath && multiPath.length >= 2) {
          const lineLatLngs = await fetchRouteGeometryWaypoints(multiPath);
          if (cancelled || !map) return;
          const leafletMap: LeafletMap = map;

          L.polyline(lineLatLngs, {
            color: "#2563eb",
            weight: 6,
            opacity: 0.9,
            lineJoin: "round",
            lineCap: "round"
          }).addTo(leafletMap);

          multiPath.forEach((pt, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === multiPath.length - 1;
            const color = isFirst ? "#15803d" : isLast ? "#1d4ed8" : "#64748b";
            const fill = isFirst ? "#22c55e" : isLast ? "#3b82f6" : "#94a3b8";
            L.circleMarker([pt.lat, pt.lng], {
              radius: isFirst || isLast ? rpx + 1 : rpx - 1,
              color,
              weight: 3,
              fillColor: fill,
              fillOpacity: 0.95
            })
              .addTo(leafletMap)
              .bindTooltip(
                pt.address?.trim() ||
                  t("route.map.markerStopN", { n: idx + 1 }),
                { sticky: true, className: "!text-base !px-3 !py-2 touch-manipulation" }
              );
          });

          leafletMap.fitBounds(L.latLngBounds(lineLatLngs), { padding: [48, 48], maxZoom: 15 });
        } else if (singleFromPath) {
          L.circleMarker([singleFromPath.lat, singleFromPath.lng], {
            radius: rpx + 1,
            color: "#1d4ed8",
            weight: 3,
            fillColor: "#3b82f6",
            fillOpacity: 0.95
          })
            .addTo(map)
            .bindTooltip(t("route.map.markerEnd"), {
              sticky: true,
              className: "!text-base !px-3 !py-2 touch-manipulation"
            });
          map.setView([singleFromPath.lat, singleFromPath.lng], 14);
        } else {
          const routeStart = okStart ? start! : null;
          const routeEnd = okEnd ? end! : null;
          const onlyEndStop = !okStart && okEnd && end;

          if (onlyEndStop) {
            L.circleMarker([end!.lat, end!.lng], {
              radius: rpx + 1,
              color: "#1d4ed8",
              weight: 3,
              fillColor: "#3b82f6",
              fillOpacity: 0.95
            })
              .addTo(map)
              .bindTooltip(t("route.map.markerEnd"), {
                sticky: true,
                className: "!text-base !px-3 !py-2 touch-manipulation"
              });
            map.setView([end.lat, end.lng], 14);
          } else if (routeStart) {
            L.circleMarker([routeStart.lat, routeStart.lng], {
              radius: rpx,
              color: "#15803d",
              weight: 3,
              fillColor: "#22c55e",
              fillOpacity: 0.95
            })
              .addTo(map)
              .bindTooltip(t("route.map.markerStart"), {
                sticky: true,
                className: "!text-base !px-3 !py-2 touch-manipulation"
              });

            let lineLatLngs: LatLngTuple[] = [];

            if (routeEnd) {
              lineLatLngs = await fetchRouteGeometryPair(routeStart, routeEnd);
              if (cancelled || !map) return;

              L.polyline(lineLatLngs, {
                color: "#2563eb",
                weight: 6,
                opacity: 0.9,
                lineJoin: "round",
                lineCap: "round"
              }).addTo(map);

              L.circleMarker([routeEnd.lat, routeEnd.lng], {
                radius: rpx + 1,
                color: "#1d4ed8",
                weight: 3,
                fillColor: "#3b82f6",
                fillOpacity: 0.95
              })
                .addTo(map)
                .bindTooltip(t("route.map.markerEnd"), {
                  sticky: true,
                  className: "!text-base !px-3 !py-2 touch-manipulation"
                });

              map.fitBounds(L.latLngBounds(lineLatLngs), { padding: [48, 48], maxZoom: 15 });
            } else {
              map.setView([routeStart.lat, routeStart.lng], 14);
            }
          }
        }

        const inv = () => {
          if (!cancelled && map) map.invalidateSize();
        };
        requestAnimationFrame(inv);
        resizeTimer = window.setTimeout(inv, 350);

        ro = new ResizeObserver(() => inv());
        ro.observe(el);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t("route.map.errors.loadFailed"));
          if (googleProxy) setImgFallback(googleProxy);
        }
      }
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
      map?.remove();
      map = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    multiPath,
    singleFromPath,
    start?.lat,
    start?.lng,
    end?.lat,
    end?.lng,
    okStart,
    okEnd,
    hasAny,
    variant,
    googleProxy,
    interventionId,
    t
  ]);

  if (!hasAny) {
    return (
      <div
        className={cn(
          "flex min-h-[min(40vh,20rem)] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-muted/40 p-10 text-center md:min-h-52",
          variant === "compact" && "min-h-44 p-6",
          className
        )}
      >
        <MapPinOff className="h-12 w-12 shrink-0 text-muted-foreground" aria-hidden />
        <p className="max-w-lg text-lg leading-snug text-muted-foreground md:text-xl">
          {t.rich("route.map.empty", {
            start: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
            end: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>
          })}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-muted/20 shadow-sm",
        className
      )}
    >
      <div
        ref={wrapRef}
        className={cn(
          "w-full touch-manipulation [&_.leaflet-control-zoom>a]:min-h-11 [&_.leaflet-control-zoom>a]:min-w-11 [&_.leaflet-control-zoom>a]:text-lg [&_.leaflet-control-zoom>a]:leading-[2.75rem]",
          variant === "comfortable" ? "min-h-[min(50vh,26rem)] md:min-h-[22rem]" : "min-h-60"
        )}
        role="presentation"
      />
      {error ? (
        <div className="border-t bg-card px-4 py-4 text-base">
          <p className="font-semibold text-foreground">{t("route.map.errors.osmTilesTitle")}</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          {imgFallback ? (
            <div className="mt-4 overflow-hidden rounded-xl border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgFallback}
                alt={t("route.map.fallbackAlt")}
                className="h-auto min-h-[220px] w-full object-cover"
                onError={() => setImgFallback(null)}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {t.rich("route.map.fallbackKeyHint", {
                code: (chunks) => (
                  <code className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{chunks}</code>
                )
              })}
            </p>
          )}
        </div>
      ) : (
        <p className="border-t px-4 py-3 text-center text-sm leading-relaxed text-muted-foreground md:text-base">
          {t("route.map.footerHint")}
        </p>
      )}
    </div>
  );
}
