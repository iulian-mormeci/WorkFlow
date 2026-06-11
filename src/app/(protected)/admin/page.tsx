import { redirect } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isGlobalProcedureAdmin } from "@/lib/procedures/global-procedure-admin";
import { AdminClient } from "@/components/admin/admin-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const locale = await getLocale();
  setRequestLocale(locale);
  const t = await getTranslations();

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/dashboard");

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user || !isGlobalProcedureAdmin(user)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("admin.page.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("admin.page.subtitle")}</p>
      </div>
      <AdminClient />
    </div>
  );
}
