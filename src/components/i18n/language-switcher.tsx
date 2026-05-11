"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Locale = "it" | "en";

const KEY = "wf:locale.v1";

function setLocaleCookie(locale: Locale) {
  // next-intl / common i18n convention.
  document.cookie = `NEXT_LOCALE=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function setLocaleLocal(locale: Locale) {
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    /* ignore */
  }
}

function detectCurrentLocaleFromPath(pathname: string): Locale {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "it";
}

function stripLocaleFromPath(pathname: string): string {
  if (pathname === "/en") return "/";
  if (pathname.startsWith("/en/")) return pathname.slice(3);
  return pathname;
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
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const locale = detectCurrentLocaleFromPath(pathname);
  const label = locale === "it" ? "🇮🇹 Italiano" : "🇬🇧 English";

  async function apply(next: Locale) {
    const pathnameNoLocale = stripLocaleFromPath(pathname);
    setLocaleCookie(next);
    setLocaleLocal(next);

    // Best-effort persistence in Supabase metadata (only if logged in).
    if (supabase) {
      setBusy(true);
      try {
        await supabase.auth.updateUser({ data: { locale: next } });
      } catch {
        /* ignore */
      } finally {
        setBusy(false);
      }
    }

    // Locale-aware URL + refresh so RSC (layouts, server pages) pick up `X-NEXT-INTL-LOCALE` from middleware.
    startTransition(() => {
      router.replace(pathnameNoLocale, { locale: next });
      router.refresh();
    });
  }

  return (
    <div className={className}>
      <div className="inline-flex overflow-hidden rounded-xl border bg-background">
        <Button
          type="button"
          variant={variant}
          size={size}
          className="rounded-none border-0"
          aria-pressed={locale === "it"}
          disabled={busy || isPending}
          onClick={() => void apply("it")}
        >
          🇮🇹 IT
        </Button>
        <div className="w-px bg-border" aria-hidden />
        <Button
          type="button"
          variant={variant}
          size={size}
          className="rounded-none border-0"
          aria-pressed={locale === "en"}
          disabled={busy || isPending}
          onClick={() => void apply("en")}
        >
          🇬🇧 EN
        </Button>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

