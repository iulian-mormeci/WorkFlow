"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinOff } from "lucide-react";
import type { InterventionGeoStop } from "@/lib/db/workflow-db";
import { cn } from "@/lib/utils";
import type { LatLngTuple } from "leaflet";
import type { Map as LeafletMap } from "leaflet";

type Props = {
  start?: InterventionGeoStop;
  end?: InterventionGeoStop;
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

export function InterventionRouteMapPreview({
  start,
  end,
  variant = "comfortable",
  className
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [imgFallback, setImgFallback] = useState<string | null>(null);

  const okStart = geoOk(start);
  const okEnd = geoOk(end);
  const hasAny = okStart || okEnd;

  const googleProxy = useMemo(() => {
    if (!hasAny) return null;
    const s = okStart ? start! : okEnd ? end! : null;
    if (!s) return null;
    const p = new URLSearchParams({ sLat: String(s.lat), sLng: String(s.lng) });
    if (okStart && okEnd && start && end) {
      p.set("eLat", String(end.lat));
      p.set("eLng", String(end.lng));
    }
    return `/api/map-static?${p.toString()}`;
  }, [hasAny, okStart, okEnd, start, end]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!hasAny || !el) return;

    const routeStart = okStart ? start! : null;
    const routeEnd = okEnd ? end! : null;
    const onlyEndStop = !okStart && okEnd && end;

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

        if (onlyEndStop) {
          L.circleMarker([end!.lat, end!.lng], {
            radius: rpx + 1,
            color: "#1d4ed8",
            weight: 3,
            fillColor: "#3b82f6",
            fillOpacity: 0.95
          })
            .addTo(map)
            .bindTooltip("End", {
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
            .bindTooltip("Start", {
              sticky: true,
              className: "!text-base !px-3 !py-2 touch-manipulation"
            });

          let lineLatLngs: LatLngTuple[] = [];

          if (routeEnd) {
            try {
              const res = await fetch("/api/route-geometry", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  origin: { lat: routeStart.lat, lng: routeStart.lng },
                  destination: { lat: routeEnd.lat, lng: routeEnd.lng }
                })
              });
              const j = (await res.json()) as {
                ok?: boolean;
                coordinates?: LatLngTuple[];
              };
              if (j.ok && Array.isArray(j.coordinates) && j.coordinates.length > 1) {
                lineLatLngs = j.coordinates.map(([lat, lng]) => [lat, lng] as LatLngTuple);
              }
            } catch {
              /* straight line fallback */
            }
            if (!lineLatLngs.length) {
              lineLatLngs = [
                [routeStart.lat, routeStart.lng],
                [routeEnd.lat, routeEnd.lng]
              ];
            }

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
              .bindTooltip("End", {
                sticky: true,
                className: "!text-base !px-3 !py-2 touch-manipulation"
              });

            map.fitBounds(L.latLngBounds(lineLatLngs), { padding: [48, 48], maxZoom: 15 });
          } else {
            map.setView([routeStart.lat, routeStart.lng], 14);
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
          setError(e instanceof Error ? e.message : "Map failed to load");
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
    // Leaflet deps: primitives from stops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    start?.lat,
    start?.lng,
    end?.lat,
    end?.lng,
    hasAny,
    okStart,
    okEnd,
    variant,
    googleProxy
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
          Search and tap a{" "}
          <span className="font-semibold text-foreground">start</span> address to show the map. Add{" "}
          <span className="font-semibold text-foreground">end</span> for the route line.
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
          <p className="font-semibold text-foreground">Could not load OpenStreetMap tiles</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          {imgFallback ? (
            <div className="mt-4 overflow-hidden rounded-xl border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgFallback}
                alt="Route map (Google Static)"
                className="h-auto min-h-[220px] w-full object-cover"
                onError={() => setImgFallback(null)}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Set{" "}
              <code className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">GOOGLE_MAPS_STATIC_KEY</code>{" "}
              for a static image fallback.
            </p>
          )}
        </div>
      ) : (
        <p className="border-t px-4 py-3 text-center text-sm leading-relaxed text-muted-foreground md:text-base">
          Pinch-zoom and drag · Driving path via OSRM when available · Tap markers for labels
        </p>
      )}
    </div>
  );
}
