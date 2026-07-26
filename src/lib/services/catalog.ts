import {
  CalendarClock,
  FileScan,
  FolderOpen,
  MessageCircle,
  Receipt,
  type LucideIcon
} from "lucide-react";

/** Lucide icon per `wf_services.icon` slug (kept as text in the DB so /admin/services can manage it without a redeploy). */
export const SERVICE_ICONS: Record<string, LucideIcon> = {
  receipt: Receipt,
  "file-scan": FileScan,
  "folder-open": FolderOpen,
  "calendar-clock": CalendarClock,
  "message-circle": MessageCircle
};

export function resolveServiceIcon(icon: string): LucideIcon {
  return SERVICE_ICONS[icon] ?? FolderOpen;
}

/** Matches wf_services.category check-by-convention (validated app-side, not a DB constraint). */
export const SERVICE_CATEGORIES = ["documents", "productivity", "horeca", "generic"] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
