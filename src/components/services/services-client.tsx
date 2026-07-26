"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { IconBubble } from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import { useUserServicesStore } from "@/stores/user-services";
import { resolveServiceIcon, SERVICE_CATEGORIES, type ServiceCategory } from "@/lib/services/catalog";
import { WORK_SECTORS, type WorkSector } from "@/lib/account/sectors";

type ServiceRow = {
  id: string;
  name: string;
  description: string;
  long_description: string | null;
  icon: string;
  category: string;
  sector_tags: string[];
  href: string;
  is_core: boolean;
};

export function ServicesClient() {
  const t = useTranslations("services");
  const tSector = useTranslations("account.profile");
  const { toast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const activatedIds = useUserServicesStore((s) => s.activatedIds);
  const activate = useUserServicesStore((s) => s.activate);
  const deactivate = useUserServicesStore((s) => s.deactivate);

  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [userSector, setUserSector] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<ServiceCategory | "all">("all");
  const [sectorFilter, setSectorFilter] = useState<WorkSector | "all">("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [previewService, setPreviewService] = useState<ServiceRow | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("wf_profiles")
          .select("sector")
          .eq("id", user.id)
          .maybeSingle();
        if (!cancelled) setUserSector(profile?.sector ?? null);
      }
      const { data } = await supabase
        .from("wf_services")
        .select("id, name, description, long_description, icon, category, sector_tags, href, is_core")
        .eq("is_active", true)
        .order("is_core", { ascending: false })
        .order("name", { ascending: true });
      if (!cancelled) {
        setServices((data as ServiceRow[] | null) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const filtered = services.filter((s) => {
    if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
    if (sectorFilter !== "all" && s.sector_tags.length > 0 && !s.sector_tags.includes(sectorFilter)) return false;
    return true;
  });

  const toggleService = async (service: ServiceRow, nextActive: boolean) => {
    if (!supabase) return;
    setPendingId(service.id);
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      if (nextActive) {
        const { error } = await supabase
          .from("wf_user_services")
          .upsert({ user_id: user.id, service_id: service.id });
        if (error) throw error;
        activate(service.id);
        toast({ title: t("toasts.activatedTitle", { name: service.name }) });
      } else {
        const { error } = await supabase
          .from("wf_user_services")
          .delete()
          .eq("user_id", user.id)
          .eq("service_id", service.id);
        if (error) throw error;
        deactivate(service.id);
        toast({ title: t("toasts.deactivatedTitle", { name: service.name }) });
      }
    } catch (e: any) {
      toast({ title: t("toasts.toggleFailedTitle"), description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setPendingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("loading")}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as ServiceCategory | "all")}
          className="min-h-10 touch-manipulation rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">{t("filters.allCategories")}</option>
          {SERVICE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`categories.${c}`)}
            </option>
          ))}
        </select>
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value as WorkSector | "all")}
          className="min-h-10 touch-manipulation rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">{t("filters.allSectors")}</option>
          {WORK_SECTORS.map((s) => (
            <option key={s} value={s}>
              {tSector(`sectorOptions.${s}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((service) => {
          const Icon = resolveServiceIcon(service.icon);
          const isActive = service.is_core || activatedIds.has(service.id);
          const recommended = Boolean(userSector) && service.sector_tags.includes(userSector as string);
          const busy = pendingId === service.id;
          return (
            <Card key={service.id} className="flex flex-col rounded-2xl">
              <CardHeader className="flex-1 space-y-2 p-4 md:p-5">
                <div className="flex items-start justify-between gap-2">
                  <IconBubble icon={Icon} />
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {isActive && <Badge className="border-primary/30 bg-primary/10 text-primary">{t("activeBadge")}</Badge>}
                    {recommended && !isActive && (
                      <Badge className="border-amber-400/40 bg-amber-400/10 text-amber-600 dark:text-amber-400">
                        <Sparkles className="mr-1 h-3 w-3" />
                        {t("recommendedBadge")}
                      </Badge>
                    )}
                  </div>
                </div>
                <div>
                  <CardTitle className="text-base">{service.name}</CardTitle>
                  <CardDescription>{service.description}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  <span className="rounded-full border px-2 py-0.5">{t(`categories.${service.category}`)}</span>
                  {service.sector_tags.length === 0 ? (
                    <span className="rounded-full border px-2 py-0.5">{t("categories.generic")}</span>
                  ) : (
                    service.sector_tags.map((tag) => (
                      <span key={tag} className="rounded-full border px-2 py-0.5">
                        {tSector(`sectorOptions.${tag}`)}
                      </span>
                    ))
                  )}
                </div>
              </CardHeader>
              <div className="flex items-center gap-2 border-t p-3">
                <Button type="button" variant="outline" size="sm" onClick={() => setPreviewService(service)}>
                  {t("preview")}
                </Button>
                {service.is_core ? (
                  <span className="ml-auto flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Check className="h-3.5 w-3.5" />
                    {t("alwaysOn")}
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant={isActive ? "outline" : "default"}
                    className="ml-auto"
                    disabled={busy}
                    onClick={() => void toggleService(service, !isActive)}
                  >
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {isActive ? t("deactivate") : t("activate")}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full py-10 text-center text-sm text-muted-foreground">{t("empty")}</div>
        )}
      </div>

      <Dialog open={Boolean(previewService)} onOpenChange={(o) => { if (!o) setPreviewService(null); }}>
        <DialogContent>
          {previewService && (
            <>
              <DialogHeader>
                <DialogTitle>{previewService.name}</DialogTitle>
                <DialogDescription>{previewService.long_description ?? previewService.description}</DialogDescription>
              </DialogHeader>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPreviewService(null)}>
                  {t("close")}
                </Button>
                {!previewService.is_core && (
                  <Button
                    type="button"
                    disabled={pendingId === previewService.id}
                    onClick={async () => {
                      const isActive = activatedIds.has(previewService.id);
                      await toggleService(previewService, !isActive);
                      setPreviewService(null);
                    }}
                  >
                    {activatedIds.has(previewService.id) ? t("deactivate") : t("activate")}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
