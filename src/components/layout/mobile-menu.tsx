"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { Plus, X } from "lucide-react";
import { OnlineIndicator } from "@/components/offline/online-indicator";
import { SidebarSignOut } from "@/components/auth/sidebar-sign-out";
import { SyncStatus } from "@/components/sync/sync-status";
import { GlobalSearch } from "@/components/search/global-search";
import { KeyboardShortcutsDialog } from "@/components/shortcuts/keyboard-shortcuts-dialog";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import {
  SIDEBAR_NAV_ICONS,
  type SidebarNavItem
} from "@/components/layout/sidebar-nav";
import {
  mobileBottomNavItems,
  mobileMenuExtraItems
} from "@/lib/navigation/mobile-bottom-nav";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth";
import { isGlobalProcedureAdmin } from "@/lib/procedures/global-procedure-admin";
import { useChatUnreadStore } from "@/stores/chat-unread";
import { NotificationsBell } from "@/components/notifications/notifications-bell";

type Props = {
  items: readonly SidebarNavItem[];
};

/**
 * Smartphone shell: compact top bar, fixed bottom navigation, and overflow menu sheet.
 * Hidden from `md:` upward so tablet/desktop keep the sidebar-only experience.
 */
export function MobileMenu({ items }: Props) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const isAdmin = isGlobalProcedureAdmin(user);
  const chatUnread = useChatUnreadStore((s) => s.count);

  const visibleItems = items.filter((item) => !item.adminOnly || isAdmin);
  const bottomItems = mobileBottomNavItems(visibleItems);
  const menuItems = mobileMenuExtraItems(visibleItems);

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
          open && "pointer-events-none opacity-0"
        )}
        style={{
          paddingTop: "max(0.35rem, env(safe-area-inset-top))",
          paddingBottom: "0.35rem",
          paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
          paddingRight: "max(0.75rem, env(safe-area-inset-right))"
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-tight">{t("common.appName")}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <OnlineIndicator />
            <span>{t("protectedShell.signedIn")}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <NotificationsBell />
          <Link
            href="/interventions?new=1"
            aria-label={t("interventions.list.newCta")}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm",
              "touch-manipulation active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            )}
          >
            <Plus className="h-5 w-5" />
          </Link>
        </div>
      </header>

      {/* Overflow menu sheet */}
      {open ? (
        <div
          id="mobile-nav-sheet"
          className="fixed inset-0 z-[59] flex flex-col bg-background md:hidden"
          style={{
            paddingTop: "max(0.35rem, env(safe-area-inset-top))",
            paddingBottom: "calc(4.25rem + env(safe-area-inset-bottom))"
          }}
          role="dialog"
          aria-modal="true"
          aria-label={t("mobileMenu.mainNavigation")}
        >
          <div
            className="flex items-center justify-between border-b px-3 py-2.5"
            style={{
              paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
              paddingRight: "max(0.75rem, env(safe-area-inset-right))"
            }}
          >
            <div>
              <p className="text-sm font-semibold">{t("mobileMenu.menuTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("mobileMenu.menuSubtitle")}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 touch-manipulation rounded-xl"
              aria-label={t("mobileMenu.closeMenu")}
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3"
            style={{
              paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
              paddingRight: "max(0.75rem, env(safe-area-inset-right))"
            }}
          >
            <div className="mx-auto max-w-lg space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("mobileMenu.sections.search")}
                </p>
                <GlobalSearch compact />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("mobileMenu.sections.sync")}
                </p>
                <SyncStatus />
              </div>

              <nav className="grid gap-1" aria-label={t("mobileMenu.primaryNavigation")}>
                {menuItems.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(item.href + "/");
                  const IconCmp = SIDEBAR_NAV_ICONS[item.iconName] ?? SIDEBAR_NAV_ICONS.home;
                  const showBadge = item.href === "/chat" && chatUnread > 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-12 touch-manipulation items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition active:scale-[0.99]",
                        active
                          ? "border-primary/25 bg-primary/5 text-foreground"
                          : "border-transparent bg-muted/40 hover:bg-muted/70"
                      )}
                      onClick={() => setOpen(false)}
                    >
                      <span className="relative shrink-0">
                        <Icon icon={IconCmp} size="md" tone={active ? "default" : "muted"} />
                        {showBadge && (
                          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                            {chatUnread > 99 ? "99+" : chatUnread}
                          </span>
                        )}
                      </span>
                      <span>{item.labelKey ? t(item.labelKey) : item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
                {t("protectedShell.offlineFirstNote")}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <KeyboardShortcutsDialog />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("mobileMenu.sections.language")}
                </p>
                <LanguageSwitcher />
              </div>

              <div className="border-t pt-3">
                <SidebarSignOut />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <MobileBottomNav
        items={bottomItems}
        menuActive={open}
        onMenuClick={() => setOpen((v) => !v)}
      />
    </>
  );
}
