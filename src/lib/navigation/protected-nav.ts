import type { SidebarNavItem } from "@/components/layout/sidebar-nav";

/**
 * Sidebar and mobile drawer items in display order.
 * Keep labels short—mobile uses the same metadata with tighter horizontal space.
 */
export const PROTECTED_NAV_ITEMS = [
  { href: "/dashboard", labelKey: "nav.dashboard", label: "Dashboard", iconName: "home" },
  { href: "/interventions", labelKey: "nav.interventions", label: "Interventions", iconName: "interventions" },
  { href: "/templates", labelKey: "nav.templates", label: "Templates", iconName: "templates" },
  { href: "/documents", labelKey: "nav.documents", label: "Documents", iconName: "documents" },
  { href: "/crm-tickets", labelKey: "nav.crmTickets", label: "CRM Tickets", iconName: "crmTickets" },
  { href: "/activities", labelKey: "nav.activities", label: "Activities", iconName: "activities" },
  { href: "/procedures", labelKey: "nav.procedures", label: "Procedures", iconName: "procedures" },
  { href: "/clients", labelKey: "nav.clients", label: "Clients", iconName: "clients" },
  { href: "/spare-parts", labelKey: "nav.spareParts", label: "Spare parts", iconName: "spareParts" },
  { href: "/reports", labelKey: "nav.reports", label: "Reports", iconName: "reports" },
  { href: "/statistics", labelKey: "nav.statistics", label: "Statistics", iconName: "statistics" },
  { href: "/settings", labelKey: "nav.settings", label: "Settings", iconName: "settings" }
] as const satisfies readonly SidebarNavItem[];
