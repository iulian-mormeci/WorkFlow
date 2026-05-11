import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { DashboardRecent } from "@/components/dashboard/dashboard-recent";
import { DashboardQuickActions } from "@/components/dashboard/dashboard-quick-actions";
import { QuickNoteFab } from "@/components/notes/quick-note-fab";
import { DashboardAttention } from "@/components/dashboard/dashboard-attention";
import { TodaysFocus } from "@/components/dashboard/todays-focus";
import { InstallPromptBanner } from "@/components/pwa/install-prompt-banner";
import { TodaysQuickActions } from "@/components/dashboard/todays-quick-actions";
import { getTranslations } from "next-intl/server";

export default async function ProtectedDashboardPage() {
  const t = await getTranslations();
  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.subtitle")}
        </p>
      </header>

      <OfflineBanner />
      <InstallPromptBanner />
      <DashboardStats />

      <DashboardAttention />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-4">
          <TodaysFocus />
          <DashboardRecent />
        </div>
        <div className="grid gap-4">
          <TodaysQuickActions />
          <DashboardQuickActions />
        </div>
      </div>

      <QuickNoteFab />
    </div>
  );
}

