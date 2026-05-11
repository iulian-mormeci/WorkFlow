"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth";
import { getAuthCallbackUrl } from "@/lib/supabase/site-url";
import { useTranslations } from "next-intl";

function getRedirectTo() {
  return getAuthCallbackUrl();
}

export function LoginClient() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
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
    });
    return () => subscription.unsubscribe();
  }, [supabase, setSession]);

  async function signInEmailPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Do password login server-side to set SSR cookies (prevents redirect loops).
      const res = await fetch("/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) throw new Error(await res.text());
      router.replace(nextPath);
    } catch (err: any) {
      setError(err?.message ?? t("signIn.error"));
    } finally {
      setLoading(false);
    }
  }

  async function signInOAuth(provider: "google" | "apple") {
    setError(null);
    if (!supabase) {
      setError(t("envMissing"));
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
      setError(err?.message ?? t("oauthError"));
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("signIn.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("signIn.subtitle")}
        </p>
      </header>

      <div className="rounded-2xl border bg-background p-5 shadow-sm">
        {!supabase ? (
          <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
            {t.rich("supabaseNotConfiguredSteps", {
              envExample: (chunks) => <span className="font-mono">{chunks}</span>,
              envLocal: (chunks) => <span className="font-mono">{chunks}</span>
            })}
            {t("supabaseNotConfiguredTail")}
          </p>
        ) : null}

        <form onSubmit={signInEmailPassword} className="space-y-4">
          <label className="grid gap-2 text-sm">
            <span>{t("fields.email")}</span>
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
            <span>{t("fields.password")}</span>
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
            {loading ? t("signIn.loading") : t("signIn.cta")}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <div className="text-xs text-muted-foreground">{tCommon("or")}</div>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="grid gap-3">
          <button
            disabled={loading || !supabase}
            onClick={() => signInOAuth("google")}
            className="h-11 w-full rounded-md border bg-background px-4 text-sm font-medium disabled:opacity-60"
          >
            {t("signIn.google")}
          </button>
          <button
            disabled={loading || !supabase}
            onClick={() => signInOAuth("apple")}
            className="h-11 w-full rounded-md border bg-background px-4 text-sm font-medium disabled:opacity-60"
          >
            {t("signIn.apple")}
          </button>
        </div>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {t("signIn.noAccount")}{" "}
        <Link className="underline" href="/register">
          {t("signIn.createOne")}
        </Link>
      </p>
    </main>
  );
}

