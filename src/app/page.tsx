import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WorkFlow</h1>
          <p className="text-sm text-muted-foreground">
            Offline-first PWA for field technicians
          </p>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="text-muted-foreground">
                {user.email}
              </span>
              <Link className="underline" href="/dashboard">
                Dashboard
              </Link>
              <a className="underline" href="/auth/logout">
                Sign out
              </a>
            </>
          ) : (
            <>
              <Link className="underline" href="/login">
                Sign in
              </Link>
              <Link className="underline" href="/register">
                Register
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="rounded-xl border p-5">
        <p className="text-sm text-muted-foreground">
          WorkFlow is a secure offline-first PWA for field technicians.
        </p>
      </section>
    </main>
  );
}

