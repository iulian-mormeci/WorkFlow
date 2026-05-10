"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SupabaseContextValue = {
  supabase: NonNullable<ReturnType<typeof createSupabaseBrowserClient>> | null;
  session: Session | null;
  setSession: (session: Session | null) => void;
};

const SupabaseContext = createContext<SupabaseContextValue | null>(null);

/**
 * Provides a memoised browser Supabase client plus optional session mirror for children.
 * Session state is intentionally minimal—middleware owns truth for SSR-protected routes.
 */
export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);

  const value: SupabaseContextValue = { supabase, session, setSession };

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
}

/** @throws if called outside `SupabaseProvider` */
export function useSupabase() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) throw new Error("useSupabase must be used within SupabaseProvider");
  return ctx;
}

