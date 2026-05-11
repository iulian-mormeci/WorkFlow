import { OfflineBanner } from "@/components/offline/offline-banner";
import { CrmTicketsClient } from "@/components/tickets/crm-tickets-client";
import { getTranslations } from "next-intl/server";

export default async function CrmTicketsPage() {
  const t = await getTranslations();
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("tickets.page.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("tickets.page.subtitle")}
        </p>
      </header>

      <OfflineBanner />
      <CrmTicketsClient />
    </div>
  );
}

