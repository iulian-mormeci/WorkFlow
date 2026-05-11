import { OfflineBanner } from "@/components/offline/offline-banner";
import { StatisticsClient } from "@/components/statistics/statistics-client";
import { getTranslations } from "next-intl/server";

export default async function StatisticsPage() {
  const t = await getTranslations();
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("statistics.page.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("statistics.page.subtitle")}
        </p>
      </header>

      <OfflineBanner />
      <StatisticsClient />
    </div>
  );
}

