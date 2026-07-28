"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUnoErpEventsStore } from "@/stores/unoerp-events";
import { fetchUnoErpEvents } from "@/lib/unoerp/fetch-events";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Mounts once in the protected layout. Fetches the signed-in user's synced
 * UnoERP calendar events directly from Supabase (RLS-protected) — no Dexie
 * involved, per the platform's online-only direction. Refetches every few
 * minutes so events written by the hourly cron / a manual sync show up
 * without requiring a full page reload.
 */
export function UnoErpEventsProvider() {
  const setEvents = useUnoErpEventsStore((s) => s.setEvents);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    let cancelled = false;

    async function load() {
      const {
        data: { user }
      } = await supabase!.auth.getUser();
      if (!user || cancelled) return;
      const events = await fetchUnoErpEvents(supabase!, user.id);
      if (!cancelled) setEvents(events);
    }

    void load();
    const interval = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setEvents]);

  return null;
}
