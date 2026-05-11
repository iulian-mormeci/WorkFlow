"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Locale = "it" | "en";

const KEY = "wf:locale.v1";

function setLocaleCookie(locale: Locale) {
  document.cookie = `NEXT_LOCALE=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function setLocaleLocal(locale: Locale) {
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    /* ignore */
  }
}

export function LanguageSwitcher({
  variant = "outline",
  size = "sm",
  className
}: {
  variant?: "outline" | "secondary" | "ghost" | "default";
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const currentLocale = useLocale() as Locale;
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const label = currentLocale === "it" ? "🇮🇹 Italiano" : "🇬🇧 English";

  function apply(next: Locale) {
    if (next === currentLocale) return;

    const search = typeof window !== "undefined" ? window.location.search : "";
    const base = !pathname || pathname === "" ? "/" : pathname;
    const href = `${base}${search}`;

    // Set cookie before navigation so middleware + RSC see the new locale on the first request.
    setLocaleCookie(next);
    setLocaleLocal(next);

    startTransition(() => {
      router.replace(href, { locale: next });
    });

    // Do not block locale change on Supabase; next-intl also syncs NEXT_LOCALE on navigation.
    if (supabase) {
      setBusy(true);
      void supabase.auth
        .updateUser({ data: { locale: next } })
        .catch(() => {})
        .finally(() => setBusy(false));
    }
  }

  return (
    <div className={className}>
      <div className="inline-flex overflow-hidden rounded-xl border bg-background">
        <Button
          type="button"
          variant={variant}
          size={size}
          className="rounded-none border-0"
          aria-pressed={currentLocale === "it"}
          disabled={busy || isPending}
          onClick={() => apply("it")}
        >
          🇮🇹 IT
        </Button>
        <div className="w-px bg-border" aria-hidden />
        <Button
          type="button"
          variant={variant}
          size={size}
          className="rounded-none border-0"
          aria-pressed={currentLocale === "en"}
          disabled={busy || isPending}
          onClick={() => apply("en")}
        >
          🇬🇧 EN
        </Button>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
