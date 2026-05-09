"use client";

import { useEffect, useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  registerWorkflowDexieSyncHooks,
  runFullSync,
  scheduleWorkflowSync,
  setSyncSupabaseClient
} from "@/lib/sync/sync-engine";

/**
 * Registers Dexie → debounced sync, runs full sync on startup (when signed in),
 * and on `online` + auth session changes.
 *
 * Note: Dexie DB name is global (`workflow`). If multiple accounts use the same
 * browser profile, merge local data before enabling sync or use a per-user DB name.
 */
export function WorkflowSyncRunner() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    if (!supabase) return;
    setSyncSupabaseClient(supabase);
    registerWorkflowDexieSyncHooks();

    const onOnline = () => scheduleWorkflowSync();
    window.addEventListener("online", onOnline);

    void (async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (session) await runFullSync(supabase);
    })();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) scheduleWorkflowSync();
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
      setSyncSupabaseClient(null);
    };
  }, [supabase]);

  return null;
}
