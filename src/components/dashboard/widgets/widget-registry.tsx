import type { ComponentType } from "react";
import type { WidgetId } from "@/lib/dashboard/widget-registry";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { DashboardActivities } from "@/components/dashboard/dashboard-activities";
import { DashboardAttention } from "@/components/dashboard/dashboard-attention";
import { DashboardRecent } from "@/components/dashboard/dashboard-recent";
import { TodaysFocus } from "@/components/dashboard/todays-focus";
import { TodaysQuickActions } from "@/components/dashboard/todays-quick-actions";
import { DashboardQuickActions } from "@/components/dashboard/dashboard-quick-actions";
import { WidgetAgenda } from "@/components/dashboard/widgets/widget-agenda";
import { WidgetCalendarWeek } from "@/components/dashboard/widgets/widget-calendar-week";
import { WidgetRecentProcedures } from "@/components/dashboard/widgets/widget-recent-procedures";
import { WidgetRecentFiles } from "@/components/dashboard/widgets/widget-recent-files";
import { WidgetCompanyActivity } from "@/components/dashboard/widgets/widget-company-activity";
import { WidgetActiveServices } from "@/components/dashboard/widgets/widget-active-services";
import { WidgetNotes } from "@/components/dashboard/widgets/widget-notes";
import { WidgetTemplates } from "@/components/dashboard/widgets/widget-templates";
import { WidgetDocuments } from "@/components/dashboard/widgets/widget-documents";
import { WidgetClients } from "@/components/dashboard/widgets/widget-clients";
import { WidgetSpareParts } from "@/components/dashboard/widgets/widget-spare-parts";
import { WidgetCrmTickets } from "@/components/dashboard/widgets/widget-crm-tickets";
import { WidgetChat } from "@/components/dashboard/widgets/widget-chat";
import { WidgetReports } from "@/components/dashboard/widgets/widget-reports";
import { WidgetStatistics } from "@/components/dashboard/widgets/widget-statistics";
import { WidgetMenuToCsv } from "@/components/dashboard/widgets/widget-menu-to-csv";

export const WIDGET_COMPONENTS: Record<WidgetId, ComponentType> = {
  stats: DashboardStats,
  todaysFocus: TodaysFocus,
  attention: DashboardAttention,
  recentInterventions: DashboardRecent,
  activitiesSummary: DashboardActivities,
  quickActions: DashboardQuickActions,
  todayQuickActions: TodaysQuickActions,
  agenda: WidgetAgenda,
  calendarWeek: WidgetCalendarWeek,
  notes: WidgetNotes,
  templates: WidgetTemplates,
  documents: WidgetDocuments,
  recentFiles: WidgetRecentFiles,
  clients: WidgetClients,
  crmTickets: WidgetCrmTickets,
  spareParts: WidgetSpareParts,
  chat: WidgetChat,
  recentProcedures: WidgetRecentProcedures,
  companyActivity: WidgetCompanyActivity,
  activeServices: WidgetActiveServices,
  reports: WidgetReports,
  statistics: WidgetStatistics,
  menuToCsv: WidgetMenuToCsv
};
