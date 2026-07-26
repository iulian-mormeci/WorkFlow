"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, UserCircle } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IconBubble } from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import { ROLE_CATEGORIES, WORK_SECTORS, type RoleCategory, type WorkSector } from "@/lib/account/sectors";

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role_title: string | null;
  role_category: string | null;
  sector: string | null;
  bio: string | null;
};

export function AccountProfileCard() {
  const t = useTranslations("account.profile");
  const { toast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("—");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

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
      if (cancelled || !user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);
      setEmail(user.email ?? "—");
      const { data } = await supabase.from("wf_profiles").select("*").eq("id", user.id).maybeSingle();
      if (!cancelled) {
        setProfile(
          (data as ProfileRow | null) ?? {
            id: user.id,
            first_name: null,
            last_name: null,
            avatar_url: null,
            role_title: null,
            role_category: null,
            sector: null,
            bio: null
          }
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const saveField = async (patch: Partial<ProfileRow>) => {
    if (!supabase || !userId) return;
    const { error } = await supabase.from("wf_profiles").upsert({ id: userId, ...patch });
    if (error) {
      toast({ title: t("toasts.saveFailedTitle"), description: error.message, variant: "destructive" });
    }
  };

  const updateLocal = (patch: Partial<ProfileRow>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleAvatarChange = async (file: File) => {
    if (!supabase || !userId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = data.publicUrl;
      updateLocal({ avatar_url: avatarUrl });
      await saveField({ avatar_url: avatarUrl });
      toast({ title: t("toasts.avatarUpdatedTitle") });
    } catch (e: any) {
      toast({
        title: t("toasts.avatarFailedTitle"),
        description: e?.message ?? String(e),
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
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

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2 p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <IconBubble icon={UserCircle} />
        </div>

        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border bg-muted disabled:opacity-60"
            aria-label={t("avatarLabel")}
          >
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
                {(profile?.first_name?.[0] ?? email[0] ?? "?").toUpperCase()}
              </span>
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleAvatarChange(file);
              e.target.value = "";
            }}
          />
          <div className="text-xs text-muted-foreground">
            <div className="font-medium text-foreground">{email}</div>
            <div>{t("avatarHint")}</div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">{t("firstNameLabel")}</div>
            <Input
              value={profile?.first_name ?? ""}
              onChange={(e) => updateLocal({ first_name: e.target.value })}
              onBlur={() => void saveField({ first_name: profile?.first_name ?? null })}
              placeholder={t("firstNamePlaceholder")}
              className="min-h-12 touch-manipulation text-base"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">{t("lastNameLabel")}</div>
            <Input
              value={profile?.last_name ?? ""}
              onChange={(e) => updateLocal({ last_name: e.target.value })}
              onBlur={() => void saveField({ last_name: profile?.last_name ?? null })}
              placeholder={t("lastNamePlaceholder")}
              className="min-h-12 touch-manipulation text-base"
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">{t("roleTitleLabel")}</div>
            <Input
              value={profile?.role_title ?? ""}
              onChange={(e) => updateLocal({ role_title: e.target.value })}
              onBlur={() => void saveField({ role_title: profile?.role_title ?? null })}
              placeholder={t("roleTitlePlaceholder")}
              className="min-h-12 touch-manipulation text-base"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">{t("roleCategoryLabel")}</div>
            <select
              value={profile?.role_category ?? ""}
              onChange={(e) => {
                const v = (e.target.value || null) as RoleCategory | null;
                updateLocal({ role_category: v });
                void saveField({ role_category: v });
              }}
              className="min-h-12 touch-manipulation rounded-md border border-input bg-background px-3 text-base"
            >
              <option value="">{t("roleCategoryPlaceholder")}</option>
              {ROLE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`roleCategoryOptions.${c}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <div className="text-sm font-medium">{t("sectorLabel")}</div>
          <select
            value={profile?.sector ?? ""}
            onChange={(e) => {
              const v = (e.target.value || null) as WorkSector | null;
              updateLocal({ sector: v });
              void saveField({ sector: v });
            }}
            className="min-h-12 max-w-sm touch-manipulation rounded-md border border-input bg-background px-3 text-base"
          >
            <option value="">{t("sectorPlaceholder")}</option>
            {WORK_SECTORS.map((s) => (
              <option key={s} value={s}>
                {t(`sectorOptions.${s}`)}
              </option>
            ))}
          </select>
          <div className="text-xs text-muted-foreground">{t("sectorHint")}</div>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <div className="text-sm font-medium">{t("bioLabel")}</div>
          <Textarea
            value={profile?.bio ?? ""}
            onChange={(e) => updateLocal({ bio: e.target.value })}
            onBlur={() => void saveField({ bio: profile?.bio ?? null })}
            placeholder={t("bioPlaceholder")}
            className="touch-manipulation text-base"
            maxLength={280}
          />
        </div>

        {!supabase && (
          <Button type="button" variant="outline" size="sm" disabled className="w-fit">
            {t("supabaseNotConfigured")}
          </Button>
        )}
      </CardHeader>
    </Card>
  );
}
