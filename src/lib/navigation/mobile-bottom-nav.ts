import type { SidebarNavItem } from "@/components/layout/sidebar-nav";

/** Primary destinations in the fixed mobile bottom bar. */
export const MOBILE_BOTTOM_NAV_HREFS = [
  "/dashboard",
  "/interventions",
  "/activities",
  "/procedures"
] as const;

export type MobileBottomNavHref = (typeof MOBILE_BOTTOM_NAV_HREFS)[number];

export function isMobileBottomNavHref(href: string): href is MobileBottomNavHref {
  return (MOBILE_BOTTOM_NAV_HREFS as readonly string[]).includes(href);
}

export function mobileBottomNavItems(items: readonly SidebarNavItem[]) {
  return MOBILE_BOTTOM_NAV_HREFS.flatMap((href) => {
    const item = items.find((i) => i.href === href);
    return item ? [item] : [];
  });
}

export function mobileMenuExtraItems(items: readonly SidebarNavItem[]) {
  return items.filter((item) => !isMobileBottomNavHref(item.href));
}
