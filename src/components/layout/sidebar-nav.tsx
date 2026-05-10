"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  FileScan,
  Home,
  Layers,
  LineChart,
  MessagesSquare,
  Package,
  Settings,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

export type SidebarIconName =
  | "home"
  | "interventions"
  | "templates"
  | "documents"
  | "crmTickets"
  | "clients"
  | "spareParts"
  | "reports"
  | "statistics"
  | "settings";

/** Lucide icons for each `SidebarIconName` (sidebar + mobile menu). */
export const SIDEBAR_NAV_ICONS = {
  home: Home,
  interventions: ClipboardList,
  templates: Layers,
  documents: FileScan,
  crmTickets: MessagesSquare,
  clients: Users,
  spareParts: Package,
  reports: BarChart3,
  statistics: LineChart,
  settings: Settings
} satisfies Record<SidebarIconName, typeof Home>;

export type SidebarNavItem = {
  href: string;
  label: string;
  iconName: SidebarIconName;
};

export function SidebarNav({ items }: { items: readonly SidebarNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="mt-5 grid gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const IconCmp = SIDEBAR_NAV_ICONS[item.iconName] ?? Home;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium",
              "transition-colors",
              active ? "bg-muted text-foreground" : "hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            )}
          >
            <Icon icon={IconCmp} size="md" tone={active ? "default" : "muted"} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

