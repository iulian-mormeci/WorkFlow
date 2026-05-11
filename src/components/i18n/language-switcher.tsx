"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
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

/** Path without `/en` or `/it` (matches middleware). Avoids double-prefix 404s when switching locale. */
function pathWithoutLocalePrefix(pathname: string): string {
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    return pathname === "/en" ? "/" : pathname.slice(3);
  }
  if (pathname === "/it" || pathname.startsWith("/it/")) {
    return pathname === "/it" ? "/" : pathname.slice(3);
  }
  return pathname;
}

/** Canonical URL for this app: Italian has no prefix, English uses `/en`. */
function localizedPath(pathname: string, locale: Locale): string {
  const base = pathWithoutLocalePrefix(pathname);
  if (locale === "en") {
    if (base === "/") return "/en";
    return `/en${base}`;
  }
  return base;
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
  const nextRouter = useRouter();
  const currentLocale = useLocale() as Locale;
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const label = currentLocale === "it" ? "🇮🇹 Italiano" : "🇬🇧 English";

  function apply(next: Locale) {
    if (next === currentLocale) return;
    if (typeof window === "undefined") return;

    const suffix = `${window.location.search}${window.location.hash}`;
    const path = localizedPath(window.location.pathname, next) + suffix;

    // Set cookie before navigation so middleware + RSC see the new locale on the first request.
    setLocaleCookie(next);
    setLocaleLocal(next);

    // Use Next's router with an explicit pathname — not next-intl's `router.replace(href, { locale })`,
    // which syncs NEXT_LOCALE using getBasePath() and can set Path=/en on the cookie while the
    // logical path is still unprefixed, producing duplicate cookies and /en/en/... 404s.
    startTransition(() => {
      nextRouter.replace(path);
    });

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
