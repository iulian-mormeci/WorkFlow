"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth";

function getRedirectTo() {
  if (typeof window === "undefined") return undefined;
  const origin = window.location.origin;
  return `${origin}/auth/callback`;
}

export function LoginClient() {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = search.get("next") ?? "/dashboard";

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const setSession = useAuthStore((s) => s.setSession);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // Ensure SSR/middleware can see the session (cookie-based) after password login.
      // OAuth already goes through /auth/callback which sets cookies server-side.
      if (session?.user && session.access_token && session.refresh_token) {
        fetch("/auth/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token
          })
        }).finally(() => {
          router.replace(nextPath);
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [router, supabase, setSession, nextPath]);

  async function signInEmailPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supabase) {
      setError("Supabase env vars are missing. Configure .env.local first.");
      return;
    }
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (signInError) throw signInError;
      // onAuthStateChange will handle cookie sync + redirect
    } catch (err: any) {
      setError(err?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function signInOAuth(provider: "google" | "apple") {
    setError(null);
    if (!supabase) {
      setError("Supabase env vars are missing. Configure .env.local first.");
      return;
    }
    setLoading(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getRedirectTo(),
          queryParams:
            provider === "google"
              ? { access_type: "offline", prompt: "consent" }
              : undefined
        }
      });
      if (oauthError) throw oauthError;
    } catch (err: any) {
      setError(err?.message ?? "OAuth login failed");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Secure access for WorkFlow technicians.
        </p>
      </header>

      <div className="rounded-2xl border bg-background p-5 shadow-sm">
        {!supabase ? (
          <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
            Supabase is not configured yet. Copy{" "}
            <span className="font-mono">.env.local.example</span> to{" "}
            <span className="font-mono">.env.local</span> and fill in the
            variables.
          </p>
        ) : null}

        <form onSubmit={signInEmailPassword} className="space-y-4">
          <label className="grid gap-2 text-sm">
            <span>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              className="h-11 rounded-md border bg-transparent px-3 outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span>Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              autoComplete="current-password"
              className="h-11 rounded-md border bg-transparent px-3 outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            disabled={loading || !supabase}
            className="h-11 w-full rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <div className="text-xs text-muted-foreground">or</div>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="grid gap-3">
          <button
            disabled={loading || !supabase}
            onClick={() => signInOAuth("google")}
            className="h-11 w-full rounded-md border bg-background px-4 text-sm font-medium disabled:opacity-60"
          >
            Continue with Google
          </button>
          <button
            disabled={loading || !supabase}
            onClick={() => signInOAuth("apple")}
            className="h-11 w-full rounded-md border bg-background px-4 text-sm font-medium disabled:opacity-60"
          >
            Continue with Apple
          </button>
        </div>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <a className="underline" href="/register">
          Create one
        </a>
      </p>
    </main>
  );
}

