import { getTranslations } from "next-intl/server";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { MenuToCsvClient } from "@/components/menu-to-csv/menu-to-csv-client";

export default async function MenuToCsvPage() {
  const t = await getTranslations("menuToCsv");
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
      </header>

      <OfflineBanner />
      <MenuToCsvClient />
    </div>
  );
}
