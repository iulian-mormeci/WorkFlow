import {
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileScan,
  FolderOpen,
  LayoutGrid,
  Layers,
  LineChart,
  ListChecks,
  ListTodo,
  MessageCircle,
  MessagesSquare,
  NotebookPen,
  Package,
  Receipt,
  Target,
  Users,
  Zap,
  type LucideIcon
} from "lucide-react";

export const WIDGET_CATEGORIES = [
  "overview",
  "productivity",
  "clientsWork",
  "communication",
  "company",
  "analytics"
] as const;

export type WidgetCategory = (typeof WIDGET_CATEGORIES)[number];

export const WIDGET_IDS = [
  "stats",
  "todaysFocus",
  "attention",
  "recentInterventions",
  "activitiesSummary",
  "quickActions",
  "todayQuickActions",
  "agenda",
  "calendarWeek",
  "notes",
  "templates",
  "documents",
  "recentFiles",
  "menuToCsv",
  "clients",
  "crmTickets",
  "spareParts",
  "chat",
  "recentProcedures",
  "companyActivity",
  "activeServices",
  "reports",
  "statistics"
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

export const WIDGET_CATEGORY_BY_ID: Record<WidgetId, WidgetCategory> = {
  stats: "overview",
  todaysFocus: "overview",
  attention: "overview",
  recentInterventions: "overview",
  activitiesSummary: "overview",
  quickActions: "overview",
  todayQuickActions: "overview",
  agenda: "overview",
  calendarWeek: "overview",
  notes: "productivity",
  templates: "productivity",
  documents: "productivity",
  recentFiles: "productivity",
  menuToCsv: "productivity",
  clients: "clientsWork",
  crmTickets: "clientsWork",
  spareParts: "clientsWork",
  chat: "communication",
  recentProcedures: "company",
  companyActivity: "company",
  activeServices: "company",
  reports: "analytics",
  statistics: "analytics"
};

export const WIDGET_ICON_BY_ID: Record<WidgetId, LucideIcon> = {
  stats: BarChart3,
  todaysFocus: Target,
  attention: ListChecks,
  recentInterventions: ClipboardList,
  activitiesSummary: ListTodo,
  quickActions: Zap,
  todayQuickActions: Zap,
  agenda: CalendarClock,
  calendarWeek: CalendarDays,
  notes: NotebookPen,
  templates: Layers,
  documents: FileScan,
  recentFiles: FolderOpen,
  menuToCsv: Receipt,
  clients: Users,
  crmTickets: MessagesSquare,
  spareParts: Package,
  chat: MessageCircle,
  recentProcedures: LayoutGrid,
  companyActivity: Building2,
  activeServices: LayoutGrid,
  reports: BarChart3,
  statistics: LineChart
};

/**
 * Roughly what the dashboard always used to show, before it became
 * customizable. A widget id that isn't in a user's saved preferences yet
 * (brand-new user, or a widget added to the catalog after they last saved)
 * falls back to this list — so adding an id here makes it show up
 * automatically for existing users too, not just new signups.
 */
export const DEFAULT_VISIBLE_WIDGETS: readonly WidgetId[] = [
  "stats",
  "activitiesSummary",
  "attention",
  "todaysFocus",
  "recentInterventions",
  "todayQuickActions",
  "quickActions",
  "agenda",
  "calendarWeek",
  "recentProcedures",
  "recentFiles",
  "companyActivity",
  "activeServices"
];

/**
 * Columns in the dashboard grid at desktop width (react-grid-layout).
 * 8 (not 4) so widgets fit 2-4 per row on wide screens now that the whole
 * site uses full viewport width instead of a centered max-w-7xl column.
 */
export const GRID_COLS = 8;
/** Columns at tablet width — react-grid-layout auto-generates this breakpoint's layout from `lg`. */
export const GRID_COLS_TABLET = 4;
/** Pixel height of one grid row. */
export const GRID_ROW_HEIGHT = 100;

export type WidgetSize = {
  w: number;
  h: number;
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
};

const SMALL: Omit<WidgetSize, "w" | "h"> = { minW: 1, minH: 1, maxW: 8, maxH: 4 };

/** Default width/height in grid units, and how far the user can resize each widget. */
export const WIDGET_DEFAULT_LAYOUT: Record<WidgetId, WidgetSize> = {
  stats: { w: 8, h: 2, ...SMALL },
  todaysFocus: { w: 4, h: 3, ...SMALL },
  attention: { w: 8, h: 3, ...SMALL },
  recentInterventions: { w: 4, h: 3, ...SMALL },
  activitiesSummary: { w: 4, h: 1, ...SMALL },
  quickActions: { w: 4, h: 2, ...SMALL },
  todayQuickActions: { w: 4, h: 2, ...SMALL },
  agenda: { w: 4, h: 3, ...SMALL },
  calendarWeek: { w: 8, h: 4, minW: 4, minH: 2, maxW: 8, maxH: 4 },
  notes: { w: 4, h: 2, ...SMALL },
  templates: { w: 4, h: 2, ...SMALL },
  documents: { w: 4, h: 2, ...SMALL },
  recentFiles: { w: 4, h: 2, ...SMALL },
  menuToCsv: { w: 2, h: 1, ...SMALL },
  clients: { w: 4, h: 2, ...SMALL },
  crmTickets: { w: 4, h: 2, ...SMALL },
  spareParts: { w: 4, h: 2, ...SMALL },
  chat: { w: 4, h: 2, ...SMALL },
  recentProcedures: { w: 4, h: 2, ...SMALL },
  companyActivity: { w: 4, h: 2, ...SMALL },
  activeServices: { w: 4, h: 2, ...SMALL },
  reports: { w: 2, h: 1, ...SMALL },
  statistics: { w: 2, h: 1, ...SMALL }
};
