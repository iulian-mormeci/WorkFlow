"use client";

import { Link, usePathname } from "@/i18n/navigation";
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  FileScan,
  FolderOpen,
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
import { useAuthStore } from "@/stores/auth";
import { isGlobalProcedureAdmin } from "@/lib/procedures/global-procedure-admin";
import { useChatUnreadStore } from "@/stores/chat-unread";

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
  | "files"
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
  files: FolderOpen,
  admin: ShieldCheck
} satisfies Record<SidebarIconName, typeof Home>;

export type SidebarNavItem = {
  href: string;
  /** Translation key for label. */
  labelKey?: string;
  /** Fallback label (used while migrating). */
  label: string;
  iconName: SidebarIconName;
  /** When true, the item is only rendered for admin/owner users. */
  adminOnly?: boolean;
};

export function SidebarNav({ items }: { items: readonly SidebarNavItem[] }) {
  const pathname = usePathname();
  const t = useTranslations();
  const user = useAuthStore((s) => s.user);
  const isAdmin = isGlobalProcedureAdmin(user);
  const chatUnread = useChatUnreadStore((s) => s.count);

  const visible = items.filter((item) => !item.adminOnly || isAdmin);

  return (
    <nav className="mt-4 grid gap-0.5 lg:mt-5">
      {visible.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const IconCmp = SIDEBAR_NAV_ICONS[item.iconName] ?? Home;
        const showBadge = item.href === "/chat" && chatUnread > 0;
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
  );
}

