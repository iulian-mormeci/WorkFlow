import { ServicesClient } from "@/components/services/services-client";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { getTranslations } from "next-intl/server";

export default async function ServicesPage() {
  const t = await getTranslations("services");
  return (
    <div className="space-y-3">
      <header className="space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
      </header>

      <OfflineBanner />
      <ServicesClient />
    </div>
  );
}
