"use client";

import { useEffect, useMemo, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { startWorkflowRealtime } from "@/lib/sync/realtime-subscriptions";
import { maybeToastSyncFailure } from "@/lib/sync/sync-notify";
import { useSyncFailureQueue } from "@/lib/sync/sync-failure-queue";
import { WorkingHoursHydrator } from "@/components/settings/working-hours-hydrator";
import {
  cancelAutomatedSyncRetry,
  registerWorkflowDexieSyncHooks,
  refreshPendingDirtyCount,
  runFullSync,
  scheduleWorkflowSync,
  setSyncSupabaseClient
} from "@/lib/sync/sync-engine";
import { useAuthStore } from "@/stores/auth";

/**
 * Client-only bootstrap for cloud sync: wires the Supabase singleton into `sync-engine`,
 * registers Dexie hooks, runs an initial full sync when a session exists, and attaches
 * Realtime + online/offline listeners. Renders nothing—mount once under the root layout.
 */
export function WorkflowSyncRunner() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const stopRealtimeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!supabase) return;
    setSyncSupabaseClient(supabase);
    registerWorkflowDexieSyncHooks();

    useSyncFailureQueue.getState().hydrate();

    const onOnline = () => scheduleWorkflowSync();
    const onOffline = () => cancelAutomatedSyncRetry();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const { setSession } = useAuthStore.getState();

    void (async () => {
      // getUser() makes a real API call — always returns fresh metadata.
      // getSession() alone would give stale JWT claims if the token hasn't rotated yet.
      const [{ data: { session } }, { data: { user: freshUser } }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser()
      ]);
      const mergedSession = session && freshUser
        ? { ...session, user: freshUser }
        : session;
      setSession(mergedSession);
      if (mergedSession?.user) {
        const r = await runFullSync(supabase);
        maybeToastSyncFailure(r);
        stopRealtimeRef.current?.();
        stopRealtimeRef.current = startWorkflowRealtime(supabase, mergedSession.user.id);
        await refreshPendingDirtyCount();
      }
    })();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      stopRealtimeRef.current?.();
      stopRealtimeRef.current = null;
      if (session?.user) {
        void runFullSync(supabase).then((r) => maybeToastSyncFailure(r));
        stopRealtimeRef.current = startWorkflowRealtime(supabase, session.user.id);
      }
      void refreshPendingDirtyCount();
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      stopRealtimeRef.current?.();
      stopRealtimeRef.current = null;
      setSyncSupabaseClient(null);
    };
  }, [supabase]);

  return <WorkingHoursHydrator />;
}
