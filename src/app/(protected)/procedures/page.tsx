import { OfflineBanner } from "@/components/offline/offline-banner";
import { ProceduresClient } from "@/components/procedures/procedures-client";
import { getTranslations } from "next-intl/server";

export default async function ProceduresPage() {
  const t = await getTranslations();
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("procedures.page.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("procedures.page.subtitle")}</p>
      </header>

      <OfflineBanner />
      <ProceduresClient />
    </div>
  );
}
