"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type RouteStopRow = {
  id: string;
  intervention_id: string;
  user_id: string;
  sort_index: number;
  label: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  updated_at: string;
};

export type RouteStopDraft = {
  id: string;
  sortIndex: number;
  label?: string;
  address?: string;
  lat?: number;
  lng?: number;
};

export function stopToDraft(r: RouteStopRow): RouteStopDraft {
  return {
    id: r.id,
    sortIndex: r.sort_index,
    label: r.label ?? undefined,
    address: r.address ?? undefined,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined
  };
}

export async function listRouteStops(interventionId: string): Promise<RouteStopDraft[]> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("wf_intervention_stops")
    .select("*")
    .eq("intervention_id", interventionId)
    .order("sort_index", { ascending: true });
  if (error || !data) return [];
  return (data as RouteStopRow[]).map(stopToDraft);
}

export async function upsertRouteStop(interventionId: string, s: RouteStopDraft) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return;

  const now = new Date().toISOString();
  await supabase.from("wf_intervention_stops").upsert(
    {
      id: s.id,
      user_id: user.id,
      intervention_id: interventionId,
      sort_index: s.sortIndex,
      label: s.label ?? null,
      address: s.address ?? null,
      lat: s.lat ?? null,
      lng: s.lng ?? null,
      updated_at: now
    },
    { onConflict: "id" }
  );
}

export async function deleteRouteStop(id: string) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return;
  await supabase.from("wf_intervention_stops").delete().eq("id", id);
}

export function subscribeRouteStops(
  interventionId: string,
  onChange: () => void
): (() => void) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return () => {};

  // Supabase caches channels by name; reusing the same name across mounts can trigger:
  // "cannot add `postgres_changes` callbacks ... after `subscribe()`".
  // Use a unique name per subscription.
  const channel = supabase.channel(
    `wf_intervention_stops:${interventionId}:${crypto.randomUUID()}`
  );
  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "wf_intervention_stops",
      filter: `intervention_id=eq.${interventionId}`
    },
    () => onChange()
  );
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

