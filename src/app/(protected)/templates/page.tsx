import { OfflineBanner } from "@/components/offline/offline-banner";
import { TemplatesClient } from "@/components/templates/templates-client";
import { getTranslations } from "next-intl/server";

export default async function TemplatesPage() {
  const t = await getTranslations();
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("templates.page.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("templates.page.subtitle")}
        </p>
      </header>

      <OfflineBanner />
      <TemplatesClient />
    </div>
  );
}

