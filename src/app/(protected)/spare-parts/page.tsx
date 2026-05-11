import { SparePartsClient } from "@/components/spare-parts/spare-parts-client";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { getTranslations } from "next-intl/server";

export default async function SparePartsPage() {
  const t = await getTranslations();
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("spareParts.page.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("spareParts.page.subtitle")}
        </p>
      </header>

      <OfflineBanner />
      <SparePartsClient />
    </div>
  );
}

