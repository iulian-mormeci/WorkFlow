import type { SidebarNavItem } from "@/components/layout/sidebar-nav";

/**
 * Sidebar and mobile drawer items in display order.
 * Keep labels short—mobile uses the same metadata with tighter horizontal space.
 */
export const PROTECTED_NAV_ITEMS = [
  { href: "/dashboard", label: "Home", iconName: "home" },
  { href: "/interventions", label: "Interventions", iconName: "interventions" },
  { href: "/templates", label: "Templates", iconName: "templates" },
  { href: "/documents", label: "Documents", iconName: "documents" },
  { href: "/crm-tickets", label: "CRM Tickets", iconName: "crmTickets" },
  { href: "/clients", label: "Clients", iconName: "clients" },
  { href: "/spare-parts", label: "Spare Parts", iconName: "spareParts" },
  { href: "/reports", label: "Reports", iconName: "reports" },
  { href: "/statistics", label: "Statistics", iconName: "statistics" },
  { href: "/settings", label: "Settings", iconName: "settings" }
] as const satisfies readonly SidebarNavItem[];
