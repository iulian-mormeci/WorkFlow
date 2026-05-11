import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-only Supabase client (`"use client"` trees). Memoize per component if you
 * call it often; `null` during build or before env is wired keeps imports safe.
 *
 * Never use `SUPABASE_SERVICE_ROLE_KEY` in the browser — server-only Route Handlers / jobs.
 * Prefer hosted Auth settings: refresh token rotation / reuse detection.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fail-soft for builds / before env is configured.
  if (!url || !anonKey) return null;

  return createBrowserClient(url, anonKey, {
    auth: {
      flowType: "pkce",
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true
    }
  });
}

