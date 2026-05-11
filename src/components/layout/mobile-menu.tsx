"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { Menu, Plus, X } from "lucide-react";
import { OnlineIndicator } from "@/components/offline/online-indicator";
import { SidebarSignOut } from "@/components/auth/sidebar-sign-out";
import { SyncStatus } from "@/components/sync/sync-status";
import { GlobalSearch } from "@/components/search/global-search";
import { KeyboardShortcutsDialog } from "@/components/shortcuts/keyboard-shortcuts-dialog";
import {
  SIDEBAR_NAV_ICONS,
  type SidebarNavItem
} from "@/components/layout/sidebar-nav";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type Props = {
  items: readonly SidebarNavItem[];
};

/**
 * Smartphone-only navigation: top bar + hamburger full-screen menu + New Intervention FAB.
 * Hidden from `md:` upward so iPad keeps the sidebar-only experience.
 */
export function MobileMenu({ items }: Props) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Top bar — phones only */}
      <header
        className={cn(
          "fixed left-0 right-0 top-0 z-[60] flex items-center gap-2 border-b bg-background/95 backdrop-blur",
          "md:hidden",
          open && "hidden"
        )}
        style={{
          paddingTop: "max(0.5rem, env(safe-area-inset-top))",
          paddingBottom: "0.5rem",
          paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
          paddingRight: "max(0.75rem, env(safe-area-inset-right))"
        }}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-expanded={open}
          aria-controls="mobile-nav-sheet"
          aria-label={open ? t("mobileMenu.closeMenu") : t("mobileMenu.openMenu")}
          className="h-12 w-12 shrink-0 touch-manipulation rounded-xl"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-semibold tracking-tight">{t("common.appName")}</div>
          <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <OnlineIndicator />
            <span>{t("protectedShell.signedIn")}</span>
          </div>
        </div>
        <div className="h-12 w-12 shrink-0" aria-hidden />
      </header>

      {/* Full-screen menu */}
      {open ? (
        <div
          id="mobile-nav-sheet"
          className="fixed inset-0 z-[55] flex flex-col bg-background md:hidden"
          style={{
            paddingTop: "max(0.5rem, env(safe-area-inset-top))",
            paddingBottom: "env(safe-area-inset-bottom)"
          }}
          role="dialog"
          aria-modal="true"
          aria-label={t("mobileMenu.mainNavigation")}
        >
          <div
            className="flex items-center justify-between border-b px-3 py-3"
            style={{
              paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
              paddingRight: "max(0.75rem, env(safe-area-inset-right))"
            }}
          >
            <div>
              <p className="text-base font-semibold">{t("mobileMenu.menuTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("mobileMenu.menuSubtitle")}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-12 w-12 shrink-0 touch-manipulation rounded-xl"
              aria-label={t("mobileMenu.closeMenu")}
              onClick={() => setOpen(false)}
            >
              <X className="h-6 w-6" />
            </Button>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 pb-28"
            style={{
              paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
              paddingRight: "max(0.75rem, env(safe-area-inset-right))"
            }}
          >
            <div className="mx-auto max-w-lg space-y-6">
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("mobileMenu.sections.search")}
                </p>
                <GlobalSearch />
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("mobileMenu.sections.sync")}
                </p>
                <SyncStatus />
              </div>

              <nav className="grid gap-1" aria-label={t("mobileMenu.primaryNavigation")}>
                {items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(item.href + "/");
                  const IconCmp = SIDEBAR_NAV_ICONS[item.iconName] ?? SIDEBAR_NAV_ICONS.home;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-14 touch-manipulation items-center gap-4 rounded-2xl border px-4 py-3.5 text-base font-medium transition active:scale-[0.99]",
                        active
                          ? "border-primary/25 bg-primary/5 text-foreground"
                          : "border-transparent bg-muted/40 hover:bg-muted/70"
                      )}
                      onClick={() => setOpen(false)}
                    >
                      <Icon icon={IconCmp} size="md" tone={active ? "default" : "muted"} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="rounded-2xl border bg-muted/40 p-4 text-xs text-muted-foreground">
                {t("protectedShell.offlineFirstNote")}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <div className="min-h-11">
                  <KeyboardShortcutsDialog />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("mobileMenu.sections.language")}
                </p>
                <LanguageSwitcher />
              </div>

              <div className="border-t pt-4">
                <SidebarSignOut />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* New Intervention FAB — phones only; sits above scroll, no tab bar */}
      <Link
        href="/interventions?new=1"
        aria-label={t("interventions.list.newCta")}
        className={cn(
          "fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[60] md:hidden",
          "flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg",
          "touch-manipulation active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        )}
      >
        <Plus className="h-6 w-6" />
      </Link>
    </>
  );
}
