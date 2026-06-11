"use client";

import { Link, usePathname } from "@/i18n/navigation";
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  FileScan,
  Home,
  Layers,
  LineChart,
  ListTodo,
  MessageCircle,
  MessagesSquare,
  NotebookPen,
  Package,
  Settings,
  ShieldCheck,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { useTranslations } from "next-intl";

export type SidebarIconName =
  | "home"
  | "interventions"
  | "templates"
  | "documents"
  | "crmTickets"
  | "activities"
  | "notes"
  | "procedures"
  | "clients"
  | "spareParts"
  | "reports"
  | "statistics"
  | "settings"
  | "chat"
  | "admin";

/** Lucide icons for each `SidebarIconName` (sidebar + mobile menu). */
export const SIDEBAR_NAV_ICONS = {
  home: Home,
  interventions: ClipboardList,
  templates: Layers,
  documents: FileScan,
  crmTickets: MessagesSquare,
  activities: ListTodo,
  notes: NotebookPen,
  procedures: BookOpen,
  clients: Users,
  spareParts: Package,
  reports: BarChart3,
  statistics: LineChart,
  settings: Settings,
  chat: MessageCircle,
  admin: ShieldCheck
} satisfies Record<SidebarIconName, typeof Home>;

export type SidebarNavItem = {
  href: string;
  /** Translation key for label. */
  labelKey?: string;
  /** Fallback label (used while migrating). */
  label: string;
  iconName: SidebarIconName;
};

export function SidebarNav({ items }: { items: readonly SidebarNavItem[] }) {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <nav className="mt-4 grid gap-0.5 lg:mt-5">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const IconCmp = SIDEBAR_NAV_ICONS[item.iconName] ?? Home;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium",
              "transition-colors",
              active ? "bg-muted text-foreground" : "hover:bg-muted/70",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            )}
          >
            <Icon icon={IconCmp} size="md" tone={active ? "default" : "muted"} />
            <span>{item.labelKey ? t(item.labelKey) : item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

