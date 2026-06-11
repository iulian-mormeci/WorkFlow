"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
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
import { Loader2, Shield } from "lucide-react";

function formatTs(iso: string | undefined, locale: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(locale);
}

export function SettingsSecurityCard() {
  const t = useTranslations("settings.security");
  const { toast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [locale, setLocale] = useState("en-US");

  const [email, setEmail] = useState<string | null>(null);
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);
  const [sessionExpires, setSessionExpires] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [confirmSignOutAll, setConfirmSignOutAll] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const {
      data: { session }
    } = await supabase.auth.getSession();
    setEmail(user?.email ?? null);
    setLastSignIn(user?.last_sign_in_at ?? user?.created_at ?? null);
    setSessionExpires(session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null);
  }, [supabase]);

  useEffect(() => {
    try {
      setLocale(typeof navigator !== "undefined" ? navigator.language : "en-US");
    } catch {
      setLocale("en-US");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!supabase) {
    return (
      <Card className="rounded-2xl lg:col-span-2">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{t("title")}</CardTitle>
              <CardDescription>{t("subtitle")}</CardDescription>
            </div>
            <IconBubble icon={Shield} />
          </div>
          <p className="text-sm text-muted-foreground">{t("supabaseMissing")}</p>
        </CardHeader>
      </Card>
    );
  }

  const lastLabel = formatTs(lastSignIn ?? undefined, locale) ?? t("lastLoginUnknown");

  return (
    <>
    <Card className="rounded-2xl lg:col-span-2">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <IconBubble icon={Shield} />
        </div>

        <div className="mt-2 grid gap-3 rounded-xl border bg-muted/30 p-4 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-muted-foreground">{t("lastLoginLabel")}</div>
            <div className="mt-1 font-medium">{lastLabel}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">{t("currentSessionTitle")}</div>
            {email ? (
              <div className="mt-1 font-medium tabular-nums">{email}</div>
            ) : (
              <div className="mt-1 text-muted-foreground">{t("currentSessionBody")}</div>
            )}
            <div className="mt-1 text-xs text-muted-foreground">{t("currentSessionDeviceHint")}</div>
            {sessionExpires ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {t("sessionRefreshHint", {
                  when: formatTs(sessionExpires, locale) ?? "—"
                })}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit min-h-11 border-destructive/50 text-destructive hover:bg-destructive/10"
              disabled={busyAll}
              onClick={() => setConfirmSignOutAll(true)}
            >
              {busyAll && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("signOutAllDevices")}
            </Button>
            <p className="text-xs text-muted-foreground sm:max-w-xl">{t("signOutAllHint")}</p>
          </div>

          <Link
            href="/privacy"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("privacyLink")}
          </Link>
        </div>
      </CardHeader>
    </Card>

    <Dialog open={confirmSignOutAll} onOpenChange={setConfirmSignOutAll}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("signOutAllDialog.title")}</DialogTitle>
          <DialogDescription>{t("signOutAllDialog.body")}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busyAll} onClick={() => setConfirmSignOutAll(false)}>
            {t("signOutAllDialog.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busyAll}
            className="gap-2"
            onClick={async () => {
              setConfirmSignOutAll(false);
              setBusyAll(true);
              try {
                const { error } = await supabase.auth.signOut({ scope: "global" });
                if (error) throw error;
                toast({ title: t("toasts.signedOutAllTitle"), description: t("toasts.signedOutAllBody") });
                window.location.href = "/auth/logout";
              } catch (e: unknown) {
                toast({
                  title: t("toasts.signedOutAllFailedTitle"),
                  description: e instanceof Error ? e.message : t("toasts.signedOutAllFailedBody"),
                  variant: "destructive"
                });
                setBusyAll(false);
              }
            }}
          >
            {busyAll && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("signOutAllDialog.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
