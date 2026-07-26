"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Database, Download, Loader2, Trash2, Upload, User } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { db } from "@/lib/db/workflow-db";
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
import { STORAGE_BUCKET } from "@/lib/sync/sync-constants";

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

export function SettingsDataCard() {
  const t = useTranslations("settings");
  const { toast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [busy, setBusy] = useState(false);
  const [rightsBusy, setRightsBusy] = useState(false);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [clearLocalConfirmOpen, setClearLocalConfirmOpen] = useState(false);
  const [deleteAllStep, setDeleteAllStep] = useState<null | "confirm1" | "confirm2">(null);
  const pendingImportRef = useRef<unknown>(null);

  return (
    <>
      <div className="grid gap-3 md:gap-4">
        <Card className="rounded-2xl">
          <CardHeader className="space-y-2 p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{t("offlineData.title")}</CardTitle>
                <CardDescription>{t("offlineData.subtitle")}</CardDescription>
              </div>
              <IconBubble icon={Database} />
            </div>

            <div className="mt-1 grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                disabled={busy}
                className="flex min-h-[5.5rem] touch-manipulation flex-col items-start gap-2 rounded-xl border bg-background p-3 text-left transition hover:bg-muted/40 disabled:opacity-50 active:scale-[0.99] sm:min-h-[6rem] sm:p-4"
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
                      activities: await db.activities.toArray(),
                      procedures: await db.procedures.toArray(),
                      notes: await db.notes.toArray(),
                      userSettings: await db.userSettings.toArray(),
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
                <Download className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">{t("offlineData.actions.exportFullBackup")}</span>
                <span className="text-xs text-muted-foreground">{t("offlineData.actions.exportFullBackupHint")}</span>
              </button>

              <button
                type="button"
                disabled={busy}
                className="flex min-h-[5.5rem] touch-manipulation flex-col items-start gap-2 rounded-xl border bg-background p-3 text-left transition hover:bg-muted/40 disabled:opacity-50 active:scale-[0.99] sm:min-h-[6rem] sm:p-4"
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
                      pendingImportRef.current = JSON.parse(text);
                      setBusy(false);
                      setImportConfirmOpen(true);
                    } catch (e: any) {
                      toast({
                        title: t("offlineData.toasts.importFailedTitle"),
                        description: e?.message ?? t("offlineData.toasts.importFailedBody"),
                        variant: "destructive"
                      });
                      setBusy(false);
                    }
                  };
                  input.click();
                }}
              >
                <Upload className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">{t("offlineData.actions.importBackup")}</span>
                <span className="text-xs text-muted-foreground">{t("offlineData.actions.importBackupHint")}</span>
              </button>

              <button
                type="button"
                disabled={busy}
                className="flex min-h-[5.5rem] touch-manipulation flex-col items-start gap-2 rounded-xl border border-destructive/30 bg-background p-3 text-left transition hover:bg-destructive/5 disabled:opacity-50 active:scale-[0.99] sm:min-h-[6rem] sm:p-4"
                onClick={() => setClearLocalConfirmOpen(true)}
              >
                <Trash2 className="h-5 w-5 text-destructive" />
                <span className="text-sm font-medium">{t("offlineData.actions.clearLocalDb")}</span>
                <span className="text-xs text-muted-foreground">{t("offlineData.actions.clearLocalDbHint")}</span>
              </button>
            </div>

            <div className="mt-1 text-xs text-muted-foreground">{t("offlineData.keyboardHint")}</div>
          </CardHeader>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="space-y-2 p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{t("rights.title")}</CardTitle>
                <CardDescription>{t("rights.subtitle")}</CardDescription>
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
                      activities: await db.activities.toArray(),
                      procedures: await db.procedures.toArray(),
                      notes: await db.notes.toArray(),
                      userSettings: await db.userSettings.toArray(),
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
                onClick={() => setDeleteAllStep("confirm1")}
              >
                <Trash2 className="h-4 w-4" />
                {t("rights.actions.deleteAll")}
              </Button>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">{t("rights.note")}</p>
          </CardHeader>
        </Card>
      </div>

      <Dialog open={importConfirmOpen} onOpenChange={(o) => { if (!busy) setImportConfirmOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("offlineData.importDialog.title")}</DialogTitle>
            <DialogDescription>{t("offlineData.importDialog.body")}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setImportConfirmOpen(false)}>
              {t("offlineData.importDialog.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              className="gap-2"
              onClick={async () => {
                const parsed = pendingImportRef.current as any;
                if (!parsed) return;
                setImportConfirmOpen(false);
                setBusy(true);
                try {
                  const attachments = (parsed.attachments ?? []).map((a: any) => {
                    const mime = a.mime ?? "application/octet-stream";
                    const blob = a.base64 ? base64ToBlob(a.base64, mime) : new Blob([], { type: mime });
                    const rest = { ...a };
                    delete rest.base64;
                    return { ...rest, blob };
                  });
                  await db.transaction("rw", db.tables, async () => {
                    await Promise.all([
                      db.clients.clear(), db.interventions.clear(), db.spareParts.clear(),
                      db.stockMovements.clear(), db.tickets.clear(), db.activities.clear(),
                      db.procedures.clear(), db.notes.clear(), db.userSettings.clear(),
                      db.documents.clear(), db.supportEmailOutbox.clear(),
                      db.templates.clear(), db.attachments.clear()
                    ]);
                    if (parsed.clients?.length) await db.clients.bulkAdd(parsed.clients);
                    if (parsed.interventions?.length) await db.interventions.bulkAdd(parsed.interventions);
                    if (parsed.spareParts?.length) await db.spareParts.bulkAdd(parsed.spareParts);
                    if (parsed.stockMovements?.length) await db.stockMovements.bulkAdd(parsed.stockMovements);
                    if (parsed.tickets?.length) await db.tickets.bulkAdd(parsed.tickets);
                    if (parsed.activities?.length) await db.activities.bulkAdd(parsed.activities);
                    if (parsed.procedures?.length) await db.procedures.bulkAdd(parsed.procedures);
                    if (parsed.notes?.length) await db.notes.bulkAdd(parsed.notes);
                    if (parsed.userSettings?.length) await db.userSettings.bulkAdd(parsed.userSettings);
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
              }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("offlineData.importDialog.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={clearLocalConfirmOpen} onOpenChange={(o) => { if (!busy) setClearLocalConfirmOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("offlineData.clearDialog.title")}</DialogTitle>
            <DialogDescription>{t("offlineData.clearDialog.body")}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setClearLocalConfirmOpen(false)}>
              {t("offlineData.clearDialog.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              className="gap-2"
              onClick={async () => {
                setClearLocalConfirmOpen(false);
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
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("offlineData.clearDialog.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteAllStep)} onOpenChange={(o) => { if (!rightsBusy && !o) setDeleteAllStep(null); }}>
        <DialogContent>
          {deleteAllStep === "confirm1" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  {t("rights.deleteAllDialog.title")}
                </DialogTitle>
                <DialogDescription>{t("rights.deleteAllDialog.body")}</DialogDescription>
              </DialogHeader>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDeleteAllStep(null)}>
                  {t("rights.deleteAllDialog.cancel")}
                </Button>
                <Button type="button" variant="destructive" onClick={() => setDeleteAllStep("confirm2")}>
                  {t("rights.deleteAllDialog.continue")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  {t("rights.deleteAllDialog.finalTitle")}
                </DialogTitle>
                <DialogDescription>{t("rights.deleteAllDialog.finalBody")}</DialogDescription>
              </DialogHeader>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={rightsBusy} onClick={() => setDeleteAllStep(null)}>
                  {t("rights.deleteAllDialog.cancel")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={rightsBusy}
                  className="gap-2"
                  onClick={async () => {
                    setDeleteAllStep(null);
                    setRightsBusy(true);
                    try {
                      if (supabase && typeof navigator !== "undefined" && navigator.onLine) {
                        const { data: { user } } = await supabase.auth.getUser();
                        const userId = user?.id ?? null;
                        if (userId) {
                          try {
                            const list = await supabase.storage.from(STORAGE_BUCKET).list(userId, { limit: 1000 });
                            const paths = (list.data ?? []).map((x) => x?.name ? `${userId}/${x.name}` : "").filter(Boolean);
                            if (paths.length) await supabase.storage.from(STORAGE_BUCKET).remove(paths);
                          } catch { /* ignore storage errors */ }
                          const tables = [
                            "wf_support_email_outbox", "wf_documents", "wf_stock_movements",
                            "wf_tickets", "wf_activities", "wf_procedures", "wf_user_settings",
                            "wf_interventions", "wf_templates", "wf_spare_parts", "wf_clients", "wf_attachments"
                          ] as const;
                          for (const tableName of tables) {
                            const { error } = await supabase.from(tableName).delete().eq("user_id", userId);
                            if (error) throw new Error(`${tableName}: ${error.message}`);
                          }
                        }
                      }
                      await db.delete();
                      toast({ title: t("rights.toasts.deletedTitle"), description: t("rights.toasts.deletedBody") });
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
                  {rightsBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("rights.deleteAllDialog.finalConfirm")}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
