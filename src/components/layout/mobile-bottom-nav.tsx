"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { LayoutGrid, Menu } from "lucide-react";
import { SIDEBAR_NAV_ICONS, type SidebarNavItem } from "@/components/layout/sidebar-nav";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type Props = {
  items: readonly SidebarNavItem[];
  menuActive: boolean;
  onMenuClick: () => void;
};

export function MobileBottomNav({ items, menuActive, onMenuClick }: Props) {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[58] border-t bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
      aria-label={t("mobileMenu.bottomNavLabel")}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 gap-0.5 px-1 pt-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const IconCmp = SIDEBAR_NAV_ICONS[item.iconName] ?? SIDEBAR_NAV_ICONS.home;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[3.25rem] touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium leading-tight transition active:scale-[0.98]",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <IconCmp className={cn("h-5 w-5 shrink-0", active && "stroke-[2.25]")} />
                <span className="max-w-full truncate px-0.5">
                  {item.labelKey ? t(item.labelKey) : item.label}
                </span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onMenuClick}
            aria-expanded={menuActive}
            aria-controls="mobile-nav-sheet"
            className={cn(
              "flex min-h-[3.25rem] w-full touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium leading-tight transition active:scale-[0.98]",
              menuActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {menuActive ? (
              <LayoutGrid className="h-5 w-5 shrink-0 stroke-[2.25]" />
            ) : (
              <Menu className="h-5 w-5 shrink-0" />
            )}
            <span>{t("mobileMenu.menuTitle")}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
