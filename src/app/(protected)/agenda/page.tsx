import { AgendaClient } from "@/components/agenda/agenda-client";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { getTranslations } from "next-intl/server";

export default async function AgendaPage() {
  const t = await getTranslations("agenda");
  return (
    <div className="space-y-3">
      <header className="space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
      </header>

      <OfflineBanner />
      <AgendaClient />
    </div>
  );
}
