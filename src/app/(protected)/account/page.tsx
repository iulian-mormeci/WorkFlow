import { AccountShell } from "@/components/account/account-shell";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { getTranslations } from "next-intl/server";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";

export default async function AccountPage() {
  const t = await getTranslations("account");
  const tCommon = await getTranslations("common");
  return (
    <div className="space-y-3">
      <header className="space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
      </header>

      <OfflineBanner />
      <AccountShell />

      <div className="text-xs text-muted-foreground">
        {t("page.appVersion", { appName: tCommon("appName"), version: APP_VERSION })}
      </div>
    </div>
  );
}
