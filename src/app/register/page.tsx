"use client";

import { useMemo, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getAuthCallbackUrl } from "@/lib/supabase/site-url";
import { useTranslations } from "next-intl";

function getEmailRedirectTo() {
  // After email confirmation, Supabase will redirect back with a code/session.
  // Use configured site URL (prevents localhost redirects in production).
  return getAuthCallbackUrl();
}

export default function RegisterPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supabase) {
      setError(t("envMissing"));
      return;
    }
    setLoading(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getEmailRedirectTo(),
          data: {
            // 2FA ready placeholder; we can enforce/track later server-side
            workflow_2fa_enabled: false
          }
        }
      });
      if (signUpError) throw signUpError;
      setSent(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || t("register.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("register.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("register.subtitle")}
        </p>
      </header>

      <div className="rounded-2xl border bg-background p-5 shadow-sm">
        {!supabase ? (
          <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
            {t.rich("register.supabaseMissing", {
              envExample: (chunks) => <span className="font-mono">{chunks}</span>,
              envLocal: (chunks) => <span className="font-mono">{chunks}</span>
            })}
          </p>
        ) : null}
        {sent ? (
          <div className="space-y-3">
            <p className="text-sm">
              {t("register.checkInbox")}
            </p>
            <button
              className="h-11 w-full rounded-md border bg-background px-4 text-sm font-medium"
              onClick={() => router.push("/login")}
            >
              {t("register.goToSignIn")}
            </button>
          </div>
        ) : (
          <form onSubmit={register} className="space-y-4">
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
                minLength={8}
                autoComplete="new-password"
                className="h-11 rounded-md border bg-transparent px-3 outline-none focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-xs text-muted-foreground">
                {t("register.passwordHint")}
              </span>
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
              {loading ? t("register.creating") : t("register.createAccount")}
            </button>
          </form>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {t("register.haveAccount")}{" "}
        <Link className="underline" href="/login">
          {t("register.signIn")}
        </Link>
      </p>
    </main>
  );
}
