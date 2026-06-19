"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Route } from "lucide-react";
import type { InterventionGeoStop } from "@/lib/db/workflow-db";
import { haversineKm } from "@/lib/geo/haversine-km";
import { InterventionRouteMapPreview } from "@/components/interventions/intervention-route-map-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";

type GeocodeHit = {
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
};

type Props = {
  start?: InterventionGeoStop;
  end?: InterventionGeoStop;
  autoKm?: number;
  onChangeStart: (v: InterventionGeoStop | undefined) => void;
  onChangeEnd: (v: InterventionGeoStop | undefined) => void;
  onAutoKm: (km: number | undefined) => void;
};

const MIN_CHARS = 3;

function LocationBlock({
  label,
  value,
  onPick,
  onClear,
  onUseCurrent
}: {
  label: string;
  value?: InterventionGeoStop;
  onPick: (hit: GeocodeHit) => void;
  onClear: () => void;
  onUseCurrent: () => void | Promise<void>;
}) {
  const t = useTranslations();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);

  const search = useCallback(async (query: string) => {
    if (query.length < MIN_CHARS) {
      setHits([]);
      setSearchedOnce(false);
      return;
    }
    setLoading(true);
    setSearchedOnce(false);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = (await res.json()) as GeocodeHit[] | { error?: string };
      if (Array.isArray(data)) setHits(data);
      else setHits([]);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
      setSearchedOnce(true);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void search(q);
    }, 400);
    return () => window.clearTimeout(id);
  }, [q, search]);

  async function handlePickHit(h: GeocodeHit) {
    // Suggestion from Places Autocomplete: has placeId but no coordinates yet.
    if (h.placeId && (!h.lat || !h.lng)) {
      setResolving(true);
      try {
        const res = await fetch(`/api/geocode?placeId=${encodeURIComponent(h.placeId)}`);
        const data = (await res.json()) as GeocodeHit[];
        const resolved = Array.isArray(data) ? data[0] : null;
        if (resolved) {
          onPick(resolved);
        } else {
          // Fallback: use the address string without coordinates (graceful degradation)
          onPick(h);
        }
      } catch {
        onPick(h);
      } finally {
        setResolving(false);
      }
    } else {
      onPick(h);
    }
    setQ("");
    setHits([]);
    setSearchedOnce(false);
  }

  const showNoResults = searchedOnce && hits.length === 0 && !loading && q.length >= MIN_CHARS;

  return (
    <div className="grid gap-3 rounded-2xl border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-base font-semibold">{label}</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-12 touch-manipulation px-4 text-base"
            onClick={onUseCurrent}
          >
            <Crosshair className="h-4 w-4" />
            {t("route.location.actions.currentLocation")}
          </Button>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="min-h-12 touch-manipulation px-4 text-base"
              onClick={onClear}
            >
              {t("route.location.actions.clear")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="relative">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("route.location.searchPlaceholder")}
          className="min-h-12 text-base touch-manipulation"
          aria-busy={loading || resolving}
        />
        {(loading || resolving) && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {hits.length > 0 ? (
        <ul className="max-h-56 overflow-auto rounded-xl border bg-background text-base">
          {hits.map((h, i) => (
            <li key={`${h.placeId ?? h.lat}-${h.lng}-${i}`}>
              <button
                type="button"
                className="min-h-14 w-full touch-manipulation px-4 py-3.5 text-left leading-snug hover:bg-muted active:bg-muted/80"
                onClick={() => void handlePickHit(h)}
              >
                {h.address}
              </button>
            </li>
          ))}
        </ul>
      ) : showNoResults ? (
        <p className="rounded-xl border bg-background px-4 py-3 text-sm text-muted-foreground">
          {t("route.location.noResults")}
        </p>
      ) : null}

      {value ? (
        <div className="flex items-start gap-2 rounded-xl border bg-background px-3 py-2 text-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <div className="font-medium">{value.address}</div>
            <div className="text-xs text-muted-foreground">
              {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">{t("route.location.noStopSelected")}</div>
      )}
    </div>
  );
}

export function InterventionLocationFields({ start, end, autoKm, onChangeStart, onChangeEnd, onAutoKm }: Props) {
  const t = useTranslations();
  const lastKmKey = useRef("");

  async function fillCurrentGeolocation(which: "start" | "end") {
    await new Promise<void>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error(t("route.location.errors.geolocationNotAvailable")));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          try {
            const res = await fetch(`/api/geocode?lat=${lat}&lon=${lng}`);
            const arr = (await res.json()) as GeocodeHit[];
            const hit = arr[0];
            if (hit) {
              if (which === "start") onChangeStart(hit);
              else onChangeEnd(hit);
            } else {
              const fallback: InterventionGeoStop = { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng };
              if (which === "start") onChangeStart(fallback);
              else onChangeEnd(fallback);
            }
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        (e) => reject(e),
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 }
      );
    });
  }

  async function computeKm() {
    if (!start || !end) {
      lastKmKey.current = "";
      onAutoKm(undefined);
      return;
    }
    const key = `${start.lat}|${start.lng}|${end.lat}|${end.lng}`;
    if (key === lastKmKey.current) return;
    lastKmKey.current = key;
    try {
      const res = await fetch("/api/route-distance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origins: { lat: start.lat, lng: start.lng },
          destinations: { lat: end.lat, lng: end.lng }
        })
      });
      const j = (await res.json()) as { ok?: boolean; km?: number };
      if (j.ok && typeof j.km === "number") {
        onAutoKm(j.km);
        return;
      }
    } catch {
      /* fall through */
    }
    onAutoKm(haversineKm(start, end));
  }

  useEffect(() => {
    void computeKm();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only recompute when coordinates change
  }, [start?.lat, start?.lng, end?.lat, end?.lng]);

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Route className="h-4 w-4 text-muted-foreground" />
        {t("route.location.title")}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LocationBlock
          label={t("route.location.startLabel")}
          value={start}
          onPick={(h) => onChangeStart({ address: h.address, lat: h.lat, lng: h.lng })}
          onClear={() => onChangeStart(undefined)}
          onUseCurrent={() => void fillCurrentGeolocation("start")}
        />
        <LocationBlock
          label={t("route.location.endLabel")}
          value={end}
          onPick={(h) => onChangeEnd({ address: h.address, lat: h.lat, lng: h.lng })}
          onClear={() => onChangeEnd(undefined)}
          onUseCurrent={() => void fillCurrentGeolocation("end")}
        />
      </div>

      {start && end ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3">
          <div>
            <div className="text-xs text-muted-foreground">{t("route.location.autoDistanceHint")}</div>
            <div className="text-lg font-semibold tabular-nums">
              {autoKm != null ? `${autoKm} km` : "—"}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-12 touch-manipulation px-5 text-base"
            onClick={() => void computeKm()}
          >
            {t("route.location.actions.recalculate")}
          </Button>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="text-sm font-semibold text-foreground">{t("route.location.mapTitle")}</div>
        <InterventionRouteMapPreview start={start} end={end} variant="comfortable" />
      </div>
    </div>
  );
}
