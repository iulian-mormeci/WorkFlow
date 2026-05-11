import { SettingsClient } from "@/components/settings/settings-client";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { getTranslations } from "next-intl/server";

export default async function SettingsPage() {
  const t = await getTranslations();
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.page.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("settings.page.subtitle")}
        </p>
      </header>

      <OfflineBanner />
      <SettingsClient />
    </div>
  );
}

