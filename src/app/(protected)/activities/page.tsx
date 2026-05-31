import { OfflineBanner } from "@/components/offline/offline-banner";
import { ActivitiesClient } from "@/components/activities/activities-client";
import { getTranslations } from "next-intl/server";

export default async function ActivitiesPage() {
  const t = await getTranslations();
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("activities.page.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("activities.page.subtitle")}</p>
      </header>

      <OfflineBanner />
      <ActivitiesClient />
    </div>
  );
}
