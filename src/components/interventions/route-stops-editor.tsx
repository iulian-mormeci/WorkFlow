"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Crosshair, GripVertical, MapPinned, Plus, Route, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { haversineKm } from "@/lib/geo/haversine-km";
import { InterventionRouteMapPreview } from "@/components/interventions/intervention-route-map-preview";
import type { InterventionGeoStop } from "@/lib/db/workflow-db";
import {
  deleteRouteStop,
  listRouteStops,
  subscribeRouteStops,
  upsertRouteStop,
  type RouteStopDraft
} from "@/lib/routes/route-stops";

type GeocodeHit = { address: string; lat: number; lng: number };

function toGeoStop(s: RouteStopDraft): InterventionGeoStop | null {
  if (typeof s.lat !== "number" || typeof s.lng !== "number") return null;
  return {
    address: s.address ?? "",
    lat: s.lat,
    lng: s.lng
  };
}

export function buildRoundTripStops(args: {
  start?: { address?: string; lat?: number; lng?: number };
  office?: { address?: string; lat?: number; lng?: number };
}): RouteStopDraft[] {
  const base = Date.now();
  const startId = crypto.randomUUID();
  const officeId = crypto.randomUUID();
  const endId = crypto.randomUUID();
  const start = args.start ?? {};
  const office = args.office ?? {};
  return [
    {
      id: startId,
      sortIndex: 10,
      label: "Start",
      address: start.address,
      lat: start.lat,
      lng: start.lng
    },
    {
      id: officeId,
      sortIndex: 20,
      label: "Office",
      address: office.address,
      lat: office.lat,
      lng: office.lng
    },
    {
      id: endId,
      sortIndex: 30,
      label: "End",
      address: start.address,
      lat: start.lat,
      lng: start.lng
    }
  ].map((s, idx) => ({ ...s, sortIndex: (idx + 1) * 10 + (base % 3) * 0 })); // keep stable indices
}

function SortableStopRow({
  stop,
  onChange,
  onRemove,
  onUseCurrent
}: {
  stop: RouteStopDraft;
  onChange: (patch: Partial<RouteStopDraft>) => void;
  onRemove: () => void;
  onUseCurrent: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.id
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1
  };

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setHits([]);
      return;
    }
    const id = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/geocode?q=${encodeURIComponent(t)}`);
          const data = (await res.json()) as GeocodeHit[] | { error?: string };
          setHits(Array.isArray(data) ? data : []);
        } catch {
          setHits([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 350);
    return () => window.clearTimeout(id);
  }, [q]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-2xl border bg-background p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="touch-manipulation rounded-xl p-2 text-muted-foreground hover:bg-muted"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </button>
          <Input
            value={stop.label ?? ""}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Label (e.g. Start, Stop 1, Office)"
            className="min-h-12 w-[min(18rem,100%)] text-base"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-12 touch-manipulation px-4 text-base"
            onClick={onUseCurrent}
          >
            <Crosshair className="h-4 w-4" />
            Current
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="min-h-12 touch-manipulation px-3 text-base text-destructive hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search address…"
          className="min-h-12 text-base touch-manipulation"
          aria-busy={loading}
        />
        {hits.length ? (
          <ul className="max-h-56 overflow-auto rounded-xl border bg-background text-base">
            {hits.map((h, i) => (
              <li key={`${h.lat}-${h.lng}-${i}`}>
                <button
                  type="button"
                  className="min-h-14 w-full touch-manipulation px-4 py-3.5 text-left leading-snug hover:bg-muted active:bg-muted/80"
                  onClick={() => {
                    onChange({ address: h.address, lat: h.lat, lng: h.lng });
                    setQ("");
                    setHits([]);
                  }}
                >
                  {h.address}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {typeof stop.lat === "number" && typeof stop.lng === "number" ? (
          <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm">
            <div className="font-medium">{stop.address || "Selected stop"}</div>
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">
              {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No coordinates yet.</div>
        )}
      </div>
    </div>
  );
}

export function RouteStopsEditor({
  interventionId,
  className,
  mode = "supabase",
  draftStops,
  onDraftStopsChange
}: {
  interventionId?: string;
  className?: string;
  mode?: "supabase" | "draft";
  draftStops?: RouteStopDraft[];
  onDraftStopsChange?: (next: RouteStopDraft[]) => void;
}) {
  const [stops, setStops] = useState<RouteStopDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const ids = useMemo(() => stops.map((s) => s.id), [stops]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function refresh() {
    if (mode !== "supabase" || !interventionId) return;
    const rows = await listRouteStops(interventionId);
    rows.sort((a, b) => a.sortIndex - b.sortIndex);
    setStops(rows);
  }

  useEffect(() => {
    if (mode === "draft") {
      setStops(draftStops ?? []);
      return;
    }
    if (!interventionId) return;
    void refresh();
    const stop = subscribeRouteStops(interventionId, () => void refresh());
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interventionId, mode]);

  useEffect(() => {
    if (mode !== "draft") return;
    setStops(draftStops ?? []);
  }, [draftStops, mode]);

  function setStopsBoth(next: RouteStopDraft[]) {
    setStops(next);
    if (mode === "draft") onDraftStopsChange?.(next);
  }

  function nextSortIndex(): number {
    const max = stops.reduce((m, s) => Math.max(m, s.sortIndex ?? 0), 0);
    return max + 10;
  }

  async function addStop() {
    const s: RouteStopDraft = {
      id: crypto.randomUUID(),
      sortIndex: nextSortIndex(),
      label: `Stop ${stops.length + 1}`
    };
    const next = [...stops, s];
    setStopsBoth(next);
    if (mode === "supabase" && interventionId) await upsertRouteStop(interventionId, s);
  }

  async function roundTrip() {
    // Simple version: duplicate first stop at end.
    const first = stops[0];
    if (!first || typeof first.lat !== "number" || typeof first.lng !== "number") return;
    const s: RouteStopDraft = {
      id: crypto.randomUUID(),
      sortIndex: nextSortIndex(),
      label: "Return",
      address: first.address,
      lat: first.lat,
      lng: first.lng
    };
    const next = [...stops, s];
    setStopsBoth(next);
    if (mode === "supabase" && interventionId) await upsertRouteStop(interventionId, s);
  }

  async function fillCurrent(stopId: string) {
    if (!navigator.geolocation) return;
    setBusy(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 60_000
        });
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      try {
        const res = await fetch(`/api/geocode?lat=${lat}&lon=${lng}`);
        const arr = (await res.json()) as GeocodeHit[];
        if (arr?.[0]?.address) address = arr[0].address;
      } catch {
        /* ignore */
      }
      await updateStop(stopId, { address, lat, lng });
    } finally {
      setBusy(false);
    }
  }

  async function updateStop(id: string, patch: Partial<RouteStopDraft>) {
    const next = stops.map((s) => (s.id === id ? { ...s, ...patch } : s));
    setStopsBoth(next);
    const row = next.find((s) => s.id === id);
    if (row && mode === "supabase" && interventionId) await upsertRouteStop(interventionId, row);
  }

  async function removeStop(id: string) {
    setStopsBoth(stops.filter((s) => s.id !== id));
    if (mode === "supabase") await deleteRouteStop(id);
  }

  async function onDragEnd(ev: DragEndEvent) {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oldIndex = stops.findIndex((x) => x.id === String(active.id));
    const newIndex = stops.findIndex((x) => x.id === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const moved = arrayMove(stops, oldIndex, newIndex).map((s, idx) => ({
      ...s,
      sortIndex: (idx + 1) * 10
    }));
    setStopsBoth(moved);
    // persist sort indexes
    if (mode === "supabase" && interventionId) {
      await Promise.all(moved.map((s) => upsertRouteStop(interventionId, s)));
    }
  }

  const geoStops = useMemo(
    () => stops.map(toGeoStop).filter(Boolean) as InterventionGeoStop[],
    [stops]
  );
  const start = geoStops[0];
  const end = geoStops.length > 1 ? geoStops[geoStops.length - 1] : undefined;

  const segments = useMemo(() => {
    const out: { from?: InterventionGeoStop; to?: InterventionGeoStop; km?: number }[] = [];
    for (let i = 0; i < geoStops.length - 1; i += 1) {
      const a = geoStops[i];
      const b = geoStops[i + 1];
      out.push({ from: a, to: b, km: haversineKm(a, b) });
    }
    return out;
  }, [geoStops]);

  const totalKm = useMemo(() => segments.reduce((s, x) => s + (x.km ?? 0), 0), [segments]);

  return (
    <div className={cn("grid gap-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Route className="h-4 w-4 text-muted-foreground" />
          Advanced route stops
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="min-h-12 touch-manipulation px-4 text-base"
            disabled={busy || geoStops.length === 0}
            onClick={() => void roundTrip()}
          >
            <MapPinned className="h-4 w-4" />
            Round trip
          </Button>
          <Button
            type="button"
            size="lg"
            className="min-h-12 touch-manipulation px-4 text-base"
            disabled={busy}
            onClick={() => void addStop()}
          >
            <Plus className="h-4 w-4" />
            Add stop
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <Label className="text-sm">Stops (drag to reorder)</Label>
        {stops.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/40 px-5 py-8 text-center text-sm text-muted-foreground">
            No stops yet. Add a stop, pick an address, then drag to reorder.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="grid gap-3">
                {stops.map((s) => (
                  <SortableStopRow
                    key={s.id}
                    stop={s}
                    onChange={(patch) => void updateStop(s.id, patch)}
                    onRemove={() => void removeStop(s.id)}
                    onUseCurrent={() => void fillCurrent(s.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="rounded-2xl border bg-background px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Total (straight-line fallback)</div>
            <div className="text-2xl font-semibold tabular-nums">{totalKm ? `${totalKm.toFixed(2)} km` : "—"}</div>
          </div>
          <div className="text-xs text-muted-foreground sm:max-w-[18rem]">
            Driving KM per segment can be added next (Google Matrix / OSRM multi-leg).
          </div>
        </div>
        {segments.length ? (
          <div className="mt-3 grid gap-2">
            {segments.map((s, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-4 py-2.5 text-sm">
                <div className="min-w-0 truncate">
                  {(stops[idx]?.label ?? `Stop ${idx + 1}`)} → {(stops[idx + 1]?.label ?? `Stop ${idx + 2}`)}
                </div>
                <div className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {s.km != null ? `${s.km.toFixed(2)} km` : "—"}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold text-foreground">Map preview</div>
        <InterventionRouteMapPreview start={start} end={end} variant="comfortable" />
      </div>
    </div>
  );
}

