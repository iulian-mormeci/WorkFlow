import { InterventionsClient } from "@/components/interventions/interventions-client";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { getTranslations } from "next-intl/server";

export default async function InterventionsPage() {
  const t = await getTranslations();
  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("interventions.page.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("interventions.page.subtitle")}
          </p>
        </div>
      </header>

      <OfflineBanner />
      <InterventionsClient />
    </div>
  );
}

