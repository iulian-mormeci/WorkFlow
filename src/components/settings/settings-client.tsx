"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Cloud,
  Database,
  Download,
  Monitor,
  Moon,
  RefreshCw,
  Trash2,
  Upload,
  User,
  X
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { db } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { IconBubble } from "@/components/ui/icon";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { useToast } from "@/hooks/use-toast";
import { usePwaInstallPrompt } from "@/hooks/use-pwa-install-prompt";
import { getReminderDefaultEmail, setReminderDefaultEmail } from "@/lib/reminders/config";
import { getSupportEmailTo, setSupportEmailTo } from "@/lib/support-email/config";
import { useSyncFailureQueue } from "@/lib/sync/sync-failure-queue";
import { useTranslations } from "next-intl";
import {
  refreshPendingDirtyCount,
  runForceFullWorkflowSync,
  runManualFullSync
} from "@/lib/sync/sync-engine";
import { STORAGE_BUCKET } from "@/lib/sync/sync-constants";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";

async function blobToBase64(blob: Blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBlob(base64: string, mime: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime || "application/octet-stream" });
}

export function SettingsClient() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { theme, toggle } = useDarkMode();
  const { canInstall, promptInstall } = usePwaInstallPrompt();
  const syncFailures = useSyncFailureQueue((s) => s.items);
  const hydrateFailures = useSyncFailureQueue((s) => s.hydrate);
  const dismissFailure = useSyncFailureQueue((s) => s.dismiss);
  const clearFailures = useSyncFailureQueue((s) => s.clearAll);

  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [rightsBusy, setRightsBusy] = useState(false);

  useEffect(() => {
    hydrateFailures();
  }, [hydrateFailures]);
  const [techName, setTechName] = useState("");
  const [supportEmail, setSupportEmail] = useState<string>(() => getSupportEmailTo());
  const [reminderEmail, setReminderEmail] = useState<string>(() => getReminderDefaultEmail());
  const [officeAddress, setOfficeAddress] = useState("");

  useEffect(() => {
    try {
      setTechName(localStorage.getItem("workflow:techName") ?? "");
      setOfficeAddress(localStorage.getItem("workflow:officeAddress") ?? "");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      // Hydrate default support email from user metadata when local is empty.
      const metaSupport = user.user_metadata?.support_email_to;
      const cloudSupport = typeof metaSupport === "string" ? metaSupport.trim() : "";
      const localSupport = getSupportEmailTo().trim();
      if (cloudSupport && !localSupport) {
        setSupportEmail(cloudSupport);
        setSupportEmailTo(cloudSupport);
      }
      const meta = user.user_metadata?.office_address;
      const fromCloud = typeof meta === "string" ? meta.trim() : "";
      let local = "";
      try {
        local = (localStorage.getItem("workflow:officeAddress") ?? "").trim();
      } catch {
        /* ignore */
      }
      if (fromCloud && !local) {
        setOfficeAddress(fromCloud);
        try {
          localStorage.setItem("workflow:officeAddress", fromCloud);
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const persistOfficeToCloud = async (value: string) => {
    if (!supabase) return;
    const trimmed = value.trim();
    try {
      await supabase.auth.updateUser({
        data: { office_address: trimmed || undefined }
      });
    } catch {
      /* offline or auth error — local copy still works */
    }
  };

  const persistSupportEmailToCloud = async (value: string) => {
    if (!supabase) return;
    const trimmed = value.trim();
    try {
      await supabase.auth.updateUser({
        data: { support_email_to: trimmed || undefined }
      });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2 text-xs text-muted-foreground">
        {t("appVersion", { appName: tCommon("appName"), version: APP_VERSION })}
      </div>
      <Card className="rounded-2xl">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{t("profile.title")}</CardTitle>
              <CardDescription>{t("profile.subtitle")}</CardDescription>
            </div>
            <IconBubble icon={User} />
          </div>
          <div className="mt-2 rounded-xl border bg-muted p-3 text-sm">
            {supabase ? (
              <ProfileInfo />
            ) : (
              <div className="text-muted-foreground">{t("profile.supabaseNotConfigured")}</div>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <div className="text-sm font-medium">{t("profile.techNameLabel")}</div>
            <Input
              value={techName}
              onChange={(e) => {
                setTechName(e.target.value);
                localStorage.setItem("workflow:techName", e.target.value);
              }}
              placeholder={t("profile.techNamePlaceholder")}
              className="min-h-12 touch-manipulation text-base"
            />
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <div className="text-sm font-medium">{t("profile.supportEmailLabel")}</div>
            <Input
              value={supportEmail}
              onChange={(e) => {
                const v = e.target.value;
                setSupportEmail(v);
                setSupportEmailTo(v);
              }}
              onBlur={() => void persistSupportEmailToCloud(supportEmail)}
              placeholder={t("profile.supportEmailPlaceholder")}
              inputMode="email"
              className="min-h-12 touch-manipulation text-base"
            />
            <div className="text-xs text-muted-foreground">
              {t("profile.supportEmailHint")}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <div className="text-sm font-medium">{t("profile.reminderEmailLabel")}</div>
            <Input
              value={reminderEmail}
              onChange={(e) => {
                const v = e.target.value;
                setReminderEmail(v);
                setReminderDefaultEmail(v);
              }}
              placeholder={t("profile.reminderEmailPlaceholder")}
              inputMode="email"
              className="min-h-12 touch-manipulation text-base"
            />
            <div className="text-xs text-muted-foreground">
              {t("profile.reminderEmailHint")}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit min-h-11 touch-manipulation"
              onClick={async () => {
                if (typeof Notification === "undefined") return;
                const p = await Notification.requestPermission();
                toast({
                  title:
                    p === "granted"
                      ? t("profile.notificationsEnabledTitle")
                      : t("profile.notificationPermissionTitle", { permission: p }),
                  description:
                    p === "granted"
                      ? t("profile.notificationsEnabledBody")
                      : t("profile.notificationPermissionBody")
                });
              }}
            >
              {t("profile.requestNotificationPermission")}
            </Button>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <div className="text-sm font-medium">{t("profile.officeAddressLabel")}</div>
            <Input
              value={officeAddress}
              onChange={(e) => {
                const v = e.target.value;
                setOfficeAddress(v);
                try {
                  localStorage.setItem("workflow:officeAddress", v);
                } catch {
                  /* ignore */
                }
              }}
              onBlur={() => void persistOfficeToCloud(officeAddress)}
              placeholder={t("profile.officeAddressPlaceholder")}
              className="min-h-12 touch-manipulation text-base"
            />
            <div className="text-xs text-muted-foreground">
              {t("profile.officeAddressHint")}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="rounded-2xl lg:col-span-2">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{t("sync.title")}</CardTitle>
              <CardDescription>
                {t("sync.subtitle")}
              </CardDescription>
            </div>
            <IconBubble icon={Cloud} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={syncBusy || !supabase}
              onClick={async () => {
                setSyncBusy(true);
                try {
                  await runManualFullSync();
                  await refreshPendingDirtyCount();
                  toast({ title: t("sync.toasts.syncFinishedTitle"), description: t("sync.toasts.syncFinishedBody") });
                } catch (e: unknown) {
                  toast({
                    title: t("sync.toasts.syncErrorTitle"),
                    description: e instanceof Error ? e.message : String(e),
                    variant: "destructive"
                  });
                } finally {
                  setSyncBusy(false);
                }
              }}
            >
              <RefreshCw className={`h-4 w-4 ${syncBusy ? "animate-spin" : ""}`} />
              {t("sync.actions.syncNow")}
            </Button>
            <Button
              variant="secondary"
              disabled={syncBusy || !supabase}
              onClick={async () => {
                setSyncBusy(true);
                try {
                  const r = await runForceFullWorkflowSync();
                  await refreshPendingDirtyCount();
                  if (r?.ok) {
                    toast({ title: t("sync.toasts.forceSyncCompleteTitle"), description: t("sync.toasts.forceSyncCompleteBody") });
                  } else if (r && !r.skipped) {
                    toast({
                      title: t("sync.toasts.forceSyncIssuesTitle"),
                      description: r.errors[0] ?? t("sync.toasts.forceSyncIssuesBodyFallback"),
                      variant: "destructive"
                    });
                  }
                } catch (e: unknown) {
                  toast({
                    title: t("sync.toasts.forceSyncErrorTitle"),
                    description: e instanceof Error ? e.message : String(e),
                    variant: "destructive"
                  });
                } finally {
                  setSyncBusy(false);
                }
              }}
            >
              {t("sync.actions.forceFullSync")}
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            <div className="text-sm font-medium">{t("sync.failures.title")}</div>
            {syncFailures.length === 0 ? (
              <div className="rounded-xl border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {t("sync.failures.empty")}
              </div>
            ) : (
              <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border bg-muted/30 p-2">
                {syncFailures.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-start justify-between gap-2 rounded-lg bg-background px-2 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">
                        [{f.kind}] {f.title}
                      </div>
                      <div className="mt-0.5 text-muted-foreground">{f.detail}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(f.at).toLocaleString()}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label={t("sync.failures.dismissAria")}
                      onClick={() => dismissFailure(f.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => clearFailures()}>
                  {t("sync.failures.clear")}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{t("appearance.title")}</CardTitle>
              <CardDescription>{t("appearance.subtitle")}</CardDescription>
            </div>
            <IconBubble icon={Monitor} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="outline" onClick={toggle}>
              <Moon className="h-4 w-4" />
              {t("appearance.toggleDarkMode", { theme })}
            </Button>
            <Button
              variant="outline"
              disabled={!canInstall}
              onClick={async () => {
                const ok = await promptInstall();
                if (!ok) return;
                toast({ title: t("appearance.toasts.installStartedTitle"), description: t("appearance.toasts.installStartedBody") });
              }}
            >
              <Download className="h-4 w-4" />
              {t("appearance.installPwa")}
            </Button>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {t("appearance.tip")}
          </div>
        </CardHeader>
      </Card>

      <Card className="rounded-2xl lg:col-span-2">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{t("offlineData.title")}</CardTitle>
              <CardDescription>{t("offlineData.subtitle")}</CardDescription>
            </div>
            <IconBubble icon={Database} />
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const data = {
                    exportedAt: new Date().toISOString(),
                    clients: await db.clients.toArray(),
                    interventions: await db.interventions.toArray(),
                    spareParts: await db.spareParts.toArray(),
                    stockMovements: await db.stockMovements.toArray(),
                    tickets: await db.tickets.toArray(),
                    documents: await db.documents.toArray(),
                    supportEmailOutbox: await db.supportEmailOutbox.toArray(),
                    templates: await db.templates.toArray(),
                    attachments: await Promise.all(
                      (await db.attachments.toArray()).map(async (a) => ({
                        ...a,
                        blob: undefined,
                        base64: await blobToBase64(a.blob)
                      }))
                    )
                  };

                  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = t("offlineData.filenames.fullBackup", {
                    date: new Date().toISOString().slice(0, 10)
                  });
                  a.click();
                  URL.revokeObjectURL(url);
                  toast({ title: t("offlineData.toasts.backupExportedTitle"), description: t("offlineData.toasts.backupExportedBody") });
                } catch (e: any) {
                  toast({
                    title: t("offlineData.toasts.exportFailedTitle"),
                    description: e?.message ?? t("offlineData.toasts.exportFailedBody"),
                    variant: "destructive"
                  });
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Download className="h-4 w-4" />
              {t("offlineData.actions.exportFullBackup")}
            </Button>

            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "application/json";
                input.onchange = async () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  try {
                    const text = await file.text();
                    const parsed = JSON.parse(text);

                    if (!confirm(t("offlineData.confirmImport"))) {
                      return;
                    }

                    const attachments = (parsed.attachments ?? []).map((a: any) => {
                      const mime = a.mime ?? "application/octet-stream";
                      const blob = a.base64 ? base64ToBlob(a.base64, mime) : new Blob([], { type: mime });
                      const rest = { ...a };
                      delete rest.base64;
                      return { ...rest, blob };
                    });

                    await db.transaction("rw", db.tables, async () => {
                        await Promise.all([
                          db.clients.clear(),
                          db.interventions.clear(),
                          db.spareParts.clear(),
                          db.stockMovements.clear(),
                          db.tickets.clear(),
                          db.documents.clear(),
                          db.supportEmailOutbox.clear(),
                          db.templates.clear(),
                          db.attachments.clear()
                        ]);

                        if (parsed.clients?.length) await db.clients.bulkAdd(parsed.clients);
                        if (parsed.interventions?.length) await db.interventions.bulkAdd(parsed.interventions);
                        if (parsed.spareParts?.length) await db.spareParts.bulkAdd(parsed.spareParts);
                        if (parsed.stockMovements?.length) await db.stockMovements.bulkAdd(parsed.stockMovements);
                        if (parsed.tickets?.length) await db.tickets.bulkAdd(parsed.tickets);
                        if (parsed.documents?.length) await db.documents.bulkAdd(parsed.documents);
                        if (parsed.supportEmailOutbox?.length) await db.supportEmailOutbox.bulkAdd(parsed.supportEmailOutbox);
                        if (parsed.templates?.length) await db.templates.bulkAdd(parsed.templates);
                        if (attachments.length) await db.attachments.bulkAdd(attachments);
                      });

                    toast({ title: t("offlineData.toasts.importCompleteTitle"), description: t("offlineData.toasts.importCompleteBody") });
                    window.location.href = "/dashboard";
                  } catch (e: any) {
                    toast({
                      title: t("offlineData.toasts.importFailedTitle"),
                      description: e?.message ?? t("offlineData.toasts.importFailedBody"),
                      variant: "destructive"
                    });
                  } finally {
                    setBusy(false);
                  }
                };
                input.click();
              }}
            >
              <Upload className="h-4 w-4" />
              {t("offlineData.actions.importBackup")}
            </Button>

            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (!confirm(t("offlineData.confirmClearLocal"))) return;
                setBusy(true);
                try {
                  await db.delete();
                  toast({ title: t("offlineData.toasts.localClearedTitle"), description: t("offlineData.toasts.localClearedBody") });
                  window.location.href = "/dashboard";
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              {t("offlineData.actions.clearLocalDb")}
            </Button>
          </div>

          <div className="mt-2 text-xs text-muted-foreground">
            {t("offlineData.keyboardHint")}
          </div>
        </CardHeader>
      </Card>

      <Card className="rounded-2xl lg:col-span-2">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{t("rights.title")}</CardTitle>
              <CardDescription>
                {t("rights.subtitle")}
              </CardDescription>
            </div>
            <IconBubble icon={User} />
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={rightsBusy}
              onClick={async () => {
                setRightsBusy(true);
                try {
                  const data = {
                    exportedAt: new Date().toISOString(),
                    profile: {
                      techName: (() => {
                        try {
                          return localStorage.getItem("workflow:techName") ?? "";
                        } catch {
                          return "";
                        }
                      })(),
                      officeAddress: (() => {
                        try {
                          return localStorage.getItem("workflow:officeAddress") ?? "";
                        } catch {
                          return "";
                        }
                      })()
                    },
                    clients: await db.clients.toArray(),
                    interventions: await db.interventions.toArray(),
                    spareParts: await db.spareParts.toArray(),
                    stockMovements: await db.stockMovements.toArray(),
                    tickets: await db.tickets.toArray(),
                    documents: await db.documents.toArray(),
                    supportEmailOutbox: await db.supportEmailOutbox.toArray(),
                    templates: await db.templates.toArray(),
                    attachments: await Promise.all(
                      (await db.attachments.toArray()).map(async (a) => ({
                        ...a,
                        blob: undefined,
                        base64: await blobToBase64(a.blob)
                      }))
                    )
                  };

                  const blob = new Blob([JSON.stringify(data, null, 2)], {
                    type: "application/json"
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = t("rights.filenames.export", {
                    date: new Date().toISOString().slice(0, 10)
                  });
                  a.click();
                  URL.revokeObjectURL(url);
                  toast({
                    title: t("rights.toasts.exportReadyTitle"),
                    description: t("rights.toasts.exportReadyBody")
                  });
                } catch (e: any) {
                  toast({
                    title: t("rights.toasts.exportFailedTitle"),
                    description: e?.message ?? t("rights.toasts.exportFailedBody"),
                    variant: "destructive"
                  });
                } finally {
                  setRightsBusy(false);
                }
              }}
            >
              <Download className="h-4 w-4" />
              {t("rights.actions.exportAllJson")}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
              disabled={rightsBusy}
              onClick={async () => {
                if (!confirm(t("rights.confirmDeleteAll"))) {
                  return;
                }
                setRightsBusy(true);
                try {
                  // Best-effort cloud wipe when signed in + online.
                  if (supabase && typeof navigator !== "undefined" && navigator.onLine) {
                    const {
                      data: { user }
                    } = await supabase.auth.getUser();
                    const userId = user?.id ?? null;
                    if (userId) {
                      // Remove storage objects first (prefix = userId/).
                      try {
                        const list = await supabase.storage
                          .from(STORAGE_BUCKET)
                          .list(userId, { limit: 1000 });
                        const paths =
                          (list.data ?? [])
                            .map((x) => (x?.name ? `${userId}/${x.name}` : ""))
                            .filter(Boolean) ?? [];
                        if (paths.length) {
                          await supabase.storage.from(STORAGE_BUCKET).remove(paths);
                        }
                      } catch {
                        /* ignore storage errors; DB deletion still proceeds */
                      }

                      // Delete rows (user-scoped). Order is defensive for FK relationships.
                      const tables = [
                        "wf_support_email_outbox",
                        "wf_documents",
                        "wf_stock_movements",
                        "wf_tickets",
                        "wf_interventions",
                        "wf_templates",
                        "wf_spare_parts",
                        "wf_clients",
                        "wf_attachments"
                      ] as const;
                      for (const tableName of tables) {
                        const { error } = await supabase.from(tableName).delete().eq("user_id", userId);
                        if (error) throw new Error(`${tableName}: ${error.message}`);
                      }
                    }
                  }

                  // Always wipe local DB.
                  await db.delete();
                  toast({
                    title: t("rights.toasts.deletedTitle"),
                    description: t("rights.toasts.deletedBody")
                  });
                  window.location.href = "/auth/logout";
                } catch (e: any) {
                  toast({
                    title: t("rights.toasts.deleteFailedTitle"),
                    description: e?.message ?? t("rights.toasts.deleteFailedBody"),
                    variant: "destructive"
                  });
                } finally {
                  setRightsBusy(false);
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              {t("rights.actions.deleteAll")}
            </Button>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {t("rights.note")}
          </p>
        </CardHeader>
      </Card>
    </div>
  );
}

function ProfileInfo() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState<string>("—");
  const tAuth = useTranslations("auth");

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "—");
    })();
  }, [supabase]);

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{tAuth("fields.email")}</div>
      <div className="font-semibold">{email}</div>
    </div>
  );
}

