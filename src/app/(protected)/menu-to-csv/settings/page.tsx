import { redirect } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isGlobalProcedureAdmin } from "@/lib/procedures/global-procedure-admin";
import { MenuToCsvSettingsClient } from "@/components/menu-to-csv/menu-to-csv-settings-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MenuToCsvSettingsPage() {
  const locale = await getLocale();
  setRequestLocale(locale);
  const t = await getTranslations("menuToCsv");

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/dashboard");

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user || !isGlobalProcedureAdmin(user)) {
    redirect("/menu-to-csv");
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t("settings.page.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.page.subtitle")}</p>
      </header>
      <MenuToCsvSettingsClient />
    </div>
  );
}
