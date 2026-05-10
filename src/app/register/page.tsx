"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getAuthCallbackUrl } from "@/lib/supabase/site-url";

function getEmailRedirectTo() {
  // After email confirmation, Supabase will redirect back with a code/session.
  // Use configured site URL (prevents localhost redirects in production).
  return getAuthCallbackUrl();
}

export default function RegisterPage() {
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
      setError("Supabase env vars are missing. Configure .env.local first.");
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
    } catch (err: any) {
      setError(err?.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="text-sm text-muted-foreground">
          You’ll receive an email to confirm your address.
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
        {sent ? (
          <div className="space-y-3">
            <p className="text-sm">
              Check your inbox to confirm your email, then come back to sign in.
            </p>
            <button
              className="h-11 w-full rounded-md border bg-background px-4 text-sm font-medium"
              onClick={() => router.push("/login")}
            >
              Go to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={register} className="space-y-4">
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
                minLength={8}
                autoComplete="new-password"
                className="h-11 rounded-md border bg-transparent px-3 outline-none focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-xs text-muted-foreground">
                Minimum 8 characters.
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
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <a className="underline" href="/login">
          Sign in
        </a>
      </p>
    </main>
  );
}

