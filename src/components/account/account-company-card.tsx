"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, Copy, Loader2, LogOut, Trash2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { IconBubble } from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import { WORK_SECTORS, type WorkSector } from "@/lib/account/sectors";

type CompanyRow = {
  id: string;
  name: string;
  piva: string | null;
  sector: string | null;
  logo_url: string | null;
  address: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  invite_code: string;
};

type MembershipRow = {
  id: string;
  company_id: string;
  role: "admin" | "manager" | "member";
};

type MemberRow = {
  id: string;
  user_id: string;
  role: "admin" | "manager" | "member";
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

const KNOWN_RPC_ERRORS = ["already_in_company", "invalid_invite_code", "name_required", "not_authenticated"] as const;

export function AccountCompanyCard() {
  const t = useTranslations("account.company");
  const { toast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<MembershipRow | null>(null);
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [logoUploading, setLogoUploading] = useState(false);

  const [createName, setCreateName] = useState("");
  const [createPiva, setCreatePiva] = useState("");
  const [createSector, setCreateSector] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  const [codeCopied, setCodeCopied] = useState(false);

  const isAdmin = membership?.role === "admin";

  const errorMessage = (e: unknown) => {
    const raw = e instanceof Error ? e.message : String(e);
    const known = KNOWN_RPC_ERRORS.find((code) => raw.includes(code));
    return known ? t(`errors.${known}`) : raw;
  };

  const loadAll = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);

    const { data: membershipRow } = await supabase
      .from("wf_company_members")
      .select("id, company_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membershipRow) {
      setMembership(null);
      setCompany(null);
      setMembers([]);
      setLoading(false);
      return;
    }
    setMembership(membershipRow as MembershipRow);

    const { data: companyRow } = await supabase
      .from("wf_companies")
      .select("*")
      .eq("id", membershipRow.company_id)
      .maybeSingle();
    setCompany(companyRow as CompanyRow | null);

    const { data: memberRows } = await supabase
      .from("wf_company_members")
      .select("id, user_id, role")
      .eq("company_id", membershipRow.company_id);

    const userIds = (memberRows ?? []).map((m) => m.user_id);
    const { data: profileRows } = userIds.length
      ? await supabase.from("wf_profiles").select("id, first_name, last_name, avatar_url").in("id", userIds)
      : { data: [] as { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }[] };

    const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));
    setMembers(
      (memberRows ?? []).map((m) => {
        const p = profileById.get(m.user_id);
        return {
          id: m.id,
          user_id: m.user_id,
          role: m.role,
          first_name: p?.first_name ?? null,
          last_name: p?.last_name ?? null,
          avatar_url: p?.avatar_url ?? null
        };
      })
    );
    setLoading(false);
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const handleCreate = async () => {
    if (!supabase || !createName.trim()) return;
    setCreating(true);
    try {
      const { error } = await supabase.rpc("wf_create_company", {
        p_name: createName.trim(),
        p_piva: createPiva.trim() || null,
        p_sector: createSector || null
      });
      if (error) throw error;
      toast({ title: t("toasts.createdTitle") });
      setCreateName("");
      setCreatePiva("");
      setCreateSector("");
      await loadAll();
    } catch (e) {
      toast({ title: t("toasts.createFailedTitle"), description: errorMessage(e), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!supabase || !joinCode.trim()) return;
    setJoining(true);
    try {
      const { error } = await supabase.rpc("wf_join_company_by_invite_code", {
        p_invite_code: joinCode.trim()
      });
      if (error) throw error;
      toast({ title: t("toasts.joinedTitle") });
      setJoinCode("");
      await loadAll();
    } catch (e) {
      toast({ title: t("toasts.joinFailedTitle"), description: errorMessage(e), variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  const saveCompanyField = async (patch: Partial<CompanyRow>) => {
    if (!supabase || !company) return;
    const { error } = await supabase.from("wf_companies").update(patch).eq("id", company.id);
    if (error) toast({ title: t("toasts.saveFailedTitle"), description: error.message, variant: "destructive" });
  };

  const updateCompanyLocal = (patch: Partial<CompanyRow>) => {
    setCompany((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleLogoChange = async (file: File) => {
    if (!supabase || !company) return;
    setLogoUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${company.id}/logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
      updateCompanyLocal({ logo_url: data.publicUrl });
      await saveCompanyField({ logo_url: data.publicUrl });
      toast({ title: t("toasts.logoUpdatedTitle") });
    } catch (e) {
      toast({ title: t("toasts.logoFailedTitle"), description: errorMessage(e), variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  };

  const changeRole = async (memberRowId: string, role: MemberRow["role"]) => {
    if (!supabase) return;
    const { error } = await supabase.from("wf_company_members").update({ role }).eq("id", memberRowId);
    if (error) {
      toast({ title: t("toasts.saveFailedTitle"), description: error.message, variant: "destructive" });
      return;
    }
    setMembers((prev) => prev.map((m) => (m.id === memberRowId ? { ...m, role } : m)));
  };

  const removeMember = async (memberRowId: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("wf_company_members").delete().eq("id", memberRowId);
    if (error) {
      toast({ title: t("toasts.saveFailedTitle"), description: error.message, variant: "destructive" });
      return;
    }
    setMembers((prev) => prev.filter((m) => m.id !== memberRowId));
  };

  const leaveCompany = async () => {
    if (!supabase || !userId) return;
    const { error } = await supabase.from("wf_company_members").delete().eq("user_id", userId);
    if (error) {
      toast({ title: t("toasts.saveFailedTitle"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t("toasts.leftTitle") });
    await loadAll();
  };

  if (loading) {
    return (
      <Card className="rounded-2xl">
        <CardHeader className="p-4 md:p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("loading")}
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (!membership || !company) {
    return (
      <Card className="rounded-2xl">
        <CardHeader className="space-y-2 p-4 md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{t("title")}</CardTitle>
              <CardDescription>{t("notInCompany.subtitle")}</CardDescription>
            </div>
            <IconBubble icon={Building2} />
          </div>

          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 rounded-xl border p-3">
              <div className="text-sm font-medium">{t("createForm.title")}</div>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={t("createForm.namePlaceholder")}
                className="min-h-11 touch-manipulation text-base"
              />
              <Input
                value={createPiva}
                onChange={(e) => setCreatePiva(e.target.value)}
                placeholder={t("createForm.pivaPlaceholder")}
                className="min-h-11 touch-manipulation text-base"
              />
              <select
                value={createSector}
                onChange={(e) => setCreateSector(e.target.value)}
                className="min-h-11 w-full touch-manipulation rounded-md border border-input bg-background px-3 text-base"
              >
                <option value="">{t("createForm.sectorPlaceholder")}</option>
                {WORK_SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {t(`sectorOptions.${s}`)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                disabled={creating || !createName.trim()}
                className="min-h-11 w-full"
                onClick={handleCreate}
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("createForm.submit")}
              </Button>
            </div>

            <div className="space-y-2 rounded-xl border p-3">
              <div className="text-sm font-medium">{t("joinForm.title")}</div>
              <div className="text-xs text-muted-foreground">{t("joinForm.hint")}</div>
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder={t("joinForm.codePlaceholder")}
                maxLength={8}
                className="min-h-11 touch-manipulation text-base uppercase"
              />
              <Button
                type="button"
                variant="outline"
                disabled={joining || !joinCode.trim()}
                className="min-h-11 w-full"
                onClick={handleJoin}
              >
                {joining && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("joinForm.submit")}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2 p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription>{t("roleLabel", { role: t(`roles.${membership.role}`) })}</CardDescription>
          </div>
          <IconBubble icon={Building2} />
        </div>

        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => isAdmin && logoInputRef.current?.click()}
            disabled={!isAdmin || logoUploading}
            className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border bg-muted disabled:cursor-default"
            aria-label={t("logoLabel")}
          >
            {company.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
                {company.name[0]?.toUpperCase()}
              </span>
            )}
            {logoUploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
            )}
          </button>
          {isAdmin && (
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleLogoChange(file);
                e.target.value = "";
              }}
            />
          )}
          <div className="min-w-0">
            <Input
              value={company.name}
              disabled={!isAdmin}
              onChange={(e) => updateCompanyLocal({ name: e.target.value })}
              onBlur={() => void saveCompanyField({ name: company.name })}
              className="min-h-11 touch-manipulation text-base font-medium"
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">{t("pivaLabel")}</div>
            <Input
              value={company.piva ?? ""}
              disabled={!isAdmin}
              onChange={(e) => updateCompanyLocal({ piva: e.target.value })}
              onBlur={() => void saveCompanyField({ piva: company.piva })}
              className="min-h-11 touch-manipulation text-base"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">{t("sectorLabel")}</div>
            <select
              value={company.sector ?? ""}
              disabled={!isAdmin}
              onChange={(e) => {
                const v = (e.target.value || null) as WorkSector | null;
                updateCompanyLocal({ sector: v });
                void saveCompanyField({ sector: v });
              }}
              className="min-h-11 touch-manipulation rounded-md border border-input bg-background px-3 text-base disabled:opacity-60"
            >
              <option value="">{t("createForm.sectorPlaceholder")}</option>
              {WORK_SECTORS.map((s) => (
                <option key={s} value={s}>
                  {t(`sectorOptions.${s}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">{t("addressLabel")}</div>
            <Input
              value={company.address ?? ""}
              disabled={!isAdmin}
              onChange={(e) => updateCompanyLocal({ address: e.target.value })}
              onBlur={() => void saveCompanyField({ address: company.address })}
              className="min-h-11 touch-manipulation text-base"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">{t("websiteLabel")}</div>
            <Input
              value={company.website ?? ""}
              disabled={!isAdmin}
              onChange={(e) => updateCompanyLocal({ website: e.target.value })}
              onBlur={() => void saveCompanyField({ website: company.website })}
              className="min-h-11 touch-manipulation text-base"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">{t("emailLabel")}</div>
            <Input
              value={company.email ?? ""}
              disabled={!isAdmin}
              inputMode="email"
              onChange={(e) => updateCompanyLocal({ email: e.target.value })}
              onBlur={() => void saveCompanyField({ email: company.email })}
              className="min-h-11 touch-manipulation text-base"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">{t("phoneLabel")}</div>
            <Input
              value={company.phone ?? ""}
              disabled={!isAdmin}
              onChange={(e) => updateCompanyLocal({ phone: e.target.value })}
              onBlur={() => void saveCompanyField({ phone: company.phone })}
              className="min-h-11 touch-manipulation text-base"
            />
          </div>
        </div>

        {isAdmin && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3">
            <div className="text-sm">
              {t("inviteCodeLabel")}: <span className="font-mono font-semibold tracking-wider">{company.invite_code}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(company.invite_code);
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 2000);
                } catch {
                  /* clipboard unavailable */
                }
              }}
            >
              {codeCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {t("copyInviteCode")}
            </Button>
          </div>
        )}

        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium">{t("members.title", { count: members.length })}</div>
          <div className="space-y-1.5">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border bg-background px-2.5 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {m.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (m.first_name?.[0] ?? "?").toUpperCase()
                    )}
                  </span>
                  <span className="truncate">
                    {[m.first_name, m.last_name].filter(Boolean).join(" ") || t("members.unnamed")}
                    {m.user_id === userId && <span className="text-muted-foreground"> ({t("members.you")})</span>}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {isAdmin && m.user_id !== userId ? (
                    <select
                      value={m.role}
                      onChange={(e) => void changeRole(m.id, e.target.value as MemberRow["role"])}
                      className="min-h-8 rounded-md border border-input bg-background px-1.5 text-xs"
                    >
                      <option value="admin">{t("roles.admin")}</option>
                      <option value="manager">{t("roles.manager")}</option>
                      <option value="member">{t("roles.member")}</option>
                    </select>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t(`roles.${m.role}`)}</span>
                  )}
                  {isAdmin && m.user_id !== userId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={t("members.remove")}
                      onClick={() => void removeMember(m.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 w-fit border-destructive/50 text-destructive hover:bg-destructive/10"
          onClick={() => void leaveCompany()}
        >
          <LogOut className="h-4 w-4" />
          {t("leaveCompany")}
        </Button>
      </CardHeader>
    </Card>
  );
}
