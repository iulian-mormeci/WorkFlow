"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBubble } from "@/components/ui/icon";
import { Link } from "@/i18n/navigation";
import { ViewAllLink } from "@/components/dashboard/clickable-card";
import { useUserServicesStore } from "@/stores/user-services";
import { resolveServiceIcon } from "@/lib/services/catalog";
import { useTranslations } from "next-intl";

type ServiceRow = {
  id: string;
  name: string;
  icon: string;
  href: string;
  is_core: boolean;
};

export function WidgetActiveServices() {
  const t = useTranslations("dashboard.widgets.activeServices");
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const activatedIds = useUserServicesStore((s) => s.activatedIds);
  const [services, setServices] = useState<ServiceRow[] | null>(null);

  useEffect(() => {
    if (!supabase) {
      setServices([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("wf_services")
        .select("id, name, icon, href, is_core")
        .eq("is_active", true)
        .order("is_core", { ascending: false })
        .order("name", { ascending: true });
      if (!cancelled) setServices((data as ServiceRow[] | null) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const active = (services ?? []).filter((s) => s.is_core || activatedIds.has(s.id));

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <ViewAllLink href="/services" label={t("viewAll")} />
            <IconBubble icon={LayoutGrid} />
          </div>
        </div>
      </CardHeader>
      <div className="px-2 pb-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {active.map((s) => {
            const Icon = resolveServiceIcon(s.icon);
            return (
              <Link
                key={s.id}
                href={s.href}
                className="flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center hover:bg-muted"
              >
                <Icon className="h-5 w-5 text-primary" />
                <span className="truncate text-xs font-medium">{s.name}</span>
              </Link>
            );
          })}

          {services !== null && active.length === 0 ? (
            <div className="col-span-full px-4 py-8 text-center text-sm text-muted-foreground">
              {t("empty")}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
