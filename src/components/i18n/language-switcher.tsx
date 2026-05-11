"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
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

/** Locale implied by the visible URL (must match middleware: EN uses `/en`, IT has no prefix). */
function localeFromPathname(pathname: string): Locale {
  if (pathname === "/en" || pathname.startsWith("/en/")) return "en";
  return "it";
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
  const pathname = usePathname() || "/";
  const activeLocale = localeFromPathname(pathname);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const label = activeLocale === "it" ? "🇮🇹 Italiano" : "🇬🇧 English";

  function apply(next: Locale) {
    if (typeof window === "undefined") return;
    // Compare to the URL, not `useLocale()`: after a client transition the provider can stay
    // stale while pathname is already `/en/...`, so `next === useLocale()` would wrongly no-op
    // and “switch back” appears broken. Mixed Italian/English chrome follows the same bug.
    if (next === localeFromPathname(window.location.pathname)) return;

    const suffix = `${window.location.search}${window.location.hash}`;
    const path = localizedPath(window.location.pathname, next) + suffix;

    setLocaleCookie(next);
    setLocaleLocal(next);

    if (supabase) {
      void supabase.auth.updateUser({ data: { locale: next } }).catch(() => {});
    }

    // Full navigation reloads the root layout + `IntlProvider` messages so sidebar / sync / search
    // always match the URL. Client `router.replace` alone can leave RSC messages one locale behind.
    window.location.assign(path);
  }

  return (
    <div className={className}>
      <div className="inline-flex overflow-hidden rounded-xl border bg-background">
        <Button
          type="button"
          variant={variant}
          size={size}
          className="rounded-none border-0"
          aria-pressed={activeLocale === "it"}
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
          aria-pressed={activeLocale === "en"}
          onClick={() => apply("en")}
        >
          🇬🇧 EN
        </Button>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
