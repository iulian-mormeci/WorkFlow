"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUserServicesStore } from "@/stores/user-services";

/**
 * Mounts once in the protected layout. Hydrates which optional services the
 * signed-in user has activated so the sidebar/mobile menu can filter
 * immediately, without waiting for the /services page to load first.
 */
export function UserServicesProvider() {
  const setActivatedIds = useUserServicesStore((s) => s.setActivatedIds);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase.from("wf_user_services").select("service_id").eq("user_id", user.id);
      if (!cancelled) setActivatedIds((data ?? []).map((r) => r.service_id));
    })();
    return () => {
      cancelled = true;
    };
  }, [setActivatedIds]);

  return null;
}
