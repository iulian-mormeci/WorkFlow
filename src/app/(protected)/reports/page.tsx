import { MonthlyCrmExport } from "@/components/reports/monthly-crm-export";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { getTranslations } from "next-intl/server";

export default async function ReportsPage() {
  const t = await getTranslations();
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("reports.page.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("reports.page.subtitle")}
        </p>
      </header>

      <OfflineBanner />
      <MonthlyCrmExport />
    </div>
  );
}

