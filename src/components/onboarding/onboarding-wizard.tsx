"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUserServicesStore } from "@/stores/user-services";
import { resolveServiceIcon } from "@/lib/services/catalog";
import { ROLE_CATEGORIES, WORK_SECTORS, type RoleCategory, type WorkSector } from "@/lib/account/sectors";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type Step = 1 | 2 | 3;

type OnboardingService = {
  id: string;
  name: string;
  description: string;
  icon: string;
  sectorTags: string[];
  isCore: boolean;
};

export function OnboardingWizard() {
  const t = useTranslations("onboarding");
  const tSector = useTranslations("account.profile");
  const { toast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const activateService = useUserServicesStore((s) => s.activate);

  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [roleCategory, setRoleCategory] = useState<RoleCategory | "">("");
  const [sector, setSector] = useState<WorkSector | "">("");

  const [services, setServices] = useState<OnboardingService[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: profile } = await supabase.from("wf_profiles").select("*").eq("id", user.id).maybeSingle();
      if (cancelled || profile?.onboarded_at) return;
      setUserId(user.id);
      setFirstName(profile?.first_name ?? "");
      setLastName(profile?.last_name ?? "");
      setRoleTitle(profile?.role_title ?? "");
      setRoleCategory((profile?.role_category as RoleCategory) ?? "");
      setSector((profile?.sector as WorkSector) ?? "");
      setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || step !== 3 || services.length > 0) return;
    void (async () => {
      const { data } = await supabase
        .from("wf_services")
        .select("id, name, description, icon, sector_tags, is_core")
        .eq("is_active", true)
        .order("is_core", { ascending: false })
        .order("name", { ascending: true });
      const rows: OnboardingService[] = (data ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        description: r.description as string,
        icon: r.icon as string,
        sectorTags: (r.sector_tags as string[] | null) ?? [],
        isCore: Boolean(r.is_core)
      }));
      setServices(rows);
      // Pre-select services recommended for the chosen sector.
      setSelectedIds(
        new Set(rows.filter((s) => !s.isCore && sector && s.sectorTags.includes(sector)).map((s) => s.id))
      );
    })();
  }, [supabase, step, services.length, sector]);

  const toggleService = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const finish = async (skip: boolean) => {
    if (!supabase || !userId) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      if (!skip) {
        await supabase
          .from("wf_profiles")
          .update({
            first_name: firstName.trim() || null,
            last_name: lastName.trim() || null,
            role_title: roleTitle.trim() || null,
            role_category: roleCategory || null,
            sector: sector || null
          })
          .eq("id", userId);

        for (const id of selectedIds) {
          const { error } = await supabase.from("wf_user_services").upsert({ user_id: userId, service_id: id });
          if (!error) activateService(id);
        }
      }
      await supabase.from("wf_profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", userId);
      setOpen(false);
    } catch (e: any) {
      toast({ title: t("saveFailedTitle"), description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) void finish(false); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(`step${step}.title`)}</DialogTitle>
          <DialogDescription>{t(`step${step}.subtitle`)}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1.5">
          {([1, 2, 3] as Step[]).map((s) => (
            <div key={s} className={cn("h-1.5 flex-1 rounded-full", s <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>

        {step === 1 && (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">{t("step1.firstNameLabel")}</label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="min-h-11" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">{t("step1.lastNameLabel")}</label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="min-h-11" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t("step1.roleTitleLabel")}</label>
              <Input
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder={t("step1.roleTitlePlaceholder")}
                className="min-h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t("step1.roleCategoryLabel")}</label>
              <select
                value={roleCategory}
                onChange={(e) => setRoleCategory(e.target.value as RoleCategory)}
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t("step1.roleCategoryPlaceholder")}</option>
                {ROLE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {tSector(`roleCategoryOptions.${c}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-2">
            {WORK_SECTORS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSector(s)}
                className={cn(
                  "rounded-xl border p-3 text-left text-sm font-medium transition-colors",
                  sector === s ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted"
                )}
              >
                {tSector(`sectorOptions.${s}`)}
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="grid max-h-80 gap-2 overflow-y-auto">
            {services
              .filter((s) => !s.isCore)
              .map((s) => {
                const Icon = resolveServiceIcon(s.icon);
                const selected = selectedIds.has(s.id);
                const recommended = Boolean(sector) && s.sectorTags.includes(sector as string);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleService(s.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                      selected ? "border-primary bg-primary/5" : "hover:bg-muted"
                    )}
                  >
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {s.name}
                        {recommended && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                            {t("step3.recommended")}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{s.description}</div>
                    </div>
                    <input type="checkbox" checked={selected} onChange={() => toggleService(s.id)} className="mt-1" />
                  </button>
                );
              })}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => void finish(true)}>
            {t("skip")}
          </Button>
          <div className="flex gap-2">
            {step > 1 && (
              <Button type="button" variant="outline" disabled={saving} onClick={() => setStep((s) => (s - 1) as Step)}>
                {t("back")}
              </Button>
            )}
            {step < 3 ? (
              <Button type="button" onClick={() => setStep((s) => (s + 1) as Step)}>
                {t("next")}
              </Button>
            ) : (
              <Button type="button" disabled={saving} onClick={() => void finish(false)}>
                {saving ? t("saving") : t("finish")}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
