"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IconBubble } from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import { resolveServiceIcon, SERVICE_CATEGORIES, SERVICE_ICONS, type ServiceCategory } from "@/lib/services/catalog";
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
  is_active: boolean;
};

const EMPTY_NEW: Omit<ServiceRow, "is_core" | "is_active"> = {
  id: "",
  name: "",
  description: "",
  long_description: "",
  icon: "folder-open",
  category: "generic",
  sector_tags: [],
  href: ""
};

export function AdminServicesClient() {
  const t = useTranslations("adminServices");
  const tSector = useTranslations("account.profile");
  const { toast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newService, setNewService] = useState(EMPTY_NEW);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("wf_services").select("*").order("name");
    setServices((data as ServiceRow[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const updateLocal = (id: string, patch: Partial<ServiceRow>) => {
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const saveField = async (id: string, patch: Partial<ServiceRow>) => {
    if (!supabase) return;
    setSavingId(id);
    const { error } = await supabase.from("wf_services").update(patch).eq("id", id);
    setSavingId(null);
    if (error) toast({ title: t("toasts.saveFailedTitle"), description: error.message, variant: "destructive" });
  };

  const toggleSector = (service: ServiceRow, sector: WorkSector) => {
    const has = service.sector_tags.includes(sector);
    const next = has ? service.sector_tags.filter((s) => s !== sector) : [...service.sector_tags, sector];
    updateLocal(service.id, { sector_tags: next });
    void saveField(service.id, { sector_tags: next });
  };

  const removeService = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("wf_services").delete().eq("id", id);
    if (error) {
      toast({ title: t("toasts.saveFailedTitle"), description: error.message, variant: "destructive" });
      return;
    }
    setServices((prev) => prev.filter((s) => s.id !== id));
  };

  const createService = async () => {
    if (!supabase || !newService.id.trim() || !newService.name.trim() || !newService.href.trim()) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("wf_services").insert({
        id: newService.id.trim(),
        name: newService.name.trim(),
        description: newService.description.trim(),
        long_description: newService.long_description?.trim() || null,
        icon: newService.icon,
        category: newService.category,
        sector_tags: newService.sector_tags,
        href: newService.href.trim(),
        is_core: false,
        is_active: true
      });
      if (error) throw error;
      toast({ title: t("toasts.createdTitle") });
      setNewService(EMPTY_NEW);
      await load();
    } catch (e: any) {
      toast({ title: t("toasts.createFailedTitle"), description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setCreating(false);
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
    <div className="space-y-4">
      <Card className="rounded-2xl">
        <CardHeader className="space-y-2 p-4 md:p-5">
          <CardTitle className="text-base">{t("newService.title")}</CardTitle>
          <CardDescription>{t("newService.subtitle")}</CardDescription>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Input
              value={newService.id}
              onChange={(e) => setNewService((s) => ({ ...s, id: e.target.value.trim().toLowerCase() }))}
              placeholder={t("newService.idPlaceholder")}
              className="min-h-10 font-mono text-sm"
            />
            <Input
              value={newService.name}
              onChange={(e) => setNewService((s) => ({ ...s, name: e.target.value }))}
              placeholder={t("newService.namePlaceholder")}
              className="min-h-10"
            />
            <Input
              value={newService.href}
              onChange={(e) => setNewService((s) => ({ ...s, href: e.target.value }))}
              placeholder={t("newService.hrefPlaceholder")}
              className="min-h-10 font-mono text-sm"
            />
            <select
              value={newService.icon}
              onChange={(e) => setNewService((s) => ({ ...s, icon: e.target.value }))}
              className="min-h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.keys(SERVICE_ICONS).map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </select>
            <select
              value={newService.category}
              onChange={(e) => setNewService((s) => ({ ...s, category: e.target.value }))}
              className="min-h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {SERVICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <Textarea
            value={newService.description}
            onChange={(e) => setNewService((s) => ({ ...s, description: e.target.value }))}
            placeholder={t("newService.descriptionPlaceholder")}
            className="mt-2"
          />
          <Button
            type="button"
            className="mt-1 w-fit"
            disabled={creating || !newService.id.trim() || !newService.name.trim() || !newService.href.trim()}
            onClick={() => void createService()}
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            <Plus className="h-4 w-4" />
            {t("newService.submit")}
          </Button>
        </CardHeader>
      </Card>

      <div className="grid gap-3">
        {services.map((service) => {
          const Icon = resolveServiceIcon(service.icon);
          const busy = savingId === service.id;
          return (
            <Card key={service.id} className="rounded-2xl">
              <CardHeader className="space-y-2 p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <IconBubble icon={Icon} />
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">{service.id}</div>
                      <CardTitle className="text-base">{service.name}</CardTitle>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <label className="flex items-center gap-1.5 text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={service.is_active}
                        onChange={(e) => {
                          updateLocal(service.id, { is_active: e.target.checked });
                          void saveField(service.id, { is_active: e.target.checked });
                        }}
                      />
                      {t("availableOnPlatform")}
                    </label>
                    {!service.is_core && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={t("delete")}
                        onClick={() => void removeService(service.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={service.name}
                    onChange={(e) => updateLocal(service.id, { name: e.target.value })}
                    onBlur={() => void saveField(service.id, { name: service.name })}
                    className="min-h-10"
                  />
                  <Input
                    value={service.href}
                    onChange={(e) => updateLocal(service.id, { href: e.target.value })}
                    onBlur={() => void saveField(service.id, { href: service.href })}
                    className="min-h-10 font-mono text-sm"
                  />
                </div>
                <Textarea
                  value={service.description}
                  onChange={(e) => updateLocal(service.id, { description: e.target.value })}
                  onBlur={() => void saveField(service.id, { description: service.description })}
                />
                <Textarea
                  value={service.long_description ?? ""}
                  onChange={(e) => updateLocal(service.id, { long_description: e.target.value })}
                  onBlur={() => void saveField(service.id, { long_description: service.long_description })}
                  placeholder={t("longDescriptionPlaceholder")}
                />

                <div className="flex flex-wrap gap-3">
                  <select
                    value={service.category}
                    onChange={(e) => {
                      const category = e.target.value as ServiceCategory;
                      updateLocal(service.id, { category });
                      void saveField(service.id, { category });
                    }}
                    className="min-h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {SERVICE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <div className="flex flex-wrap gap-2">
                    {WORK_SECTORS.map((sector) => (
                      <label key={sector} className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={service.sector_tags.includes(sector)}
                          onChange={() => toggleSector(service, sector)}
                        />
                        {tSector(`sectorOptions.${sector}`)}
                      </label>
                    ))}
                  </div>
                </div>

                {service.is_core && <div className="text-xs text-muted-foreground">{t("coreNotice")}</div>}
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
