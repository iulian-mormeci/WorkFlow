import { OfflineBanner } from "@/components/offline/offline-banner";
import { QuickNoteFab } from "@/components/notes/quick-note-fab";
import { InstallPromptBanner } from "@/components/pwa/install-prompt-banner";
import { CustomizableWidgets } from "@/components/dashboard/customizable-widgets";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
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

      <CustomizableWidgets />

      <QuickNoteFab />
      <OnboardingWizard />
    </div>
  );
}
