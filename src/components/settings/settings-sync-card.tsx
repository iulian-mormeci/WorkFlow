"use client";

import { useEffect } from "react";
import { Cloud, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBubble } from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { useSyncFailureQueue } from "@/lib/sync/sync-failure-queue";
import { useTranslations } from "next-intl";
import {
  refreshPendingDirtyCount,
  runForceFullWorkflowSync,
  runManualFullSync
} from "@/lib/sync/sync-engine";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMemo, useState } from "react";

export function SettingsSyncCard() {
  const t = useTranslations("settings.sync");
  const { toast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [syncBusy, setSyncBusy] = useState(false);
  const syncFailures = useSyncFailureQueue((s) => s.items);
  const hydrateFailures = useSyncFailureQueue((s) => s.hydrate);
  const dismissFailure = useSyncFailureQueue((s) => s.dismiss);
  const clearFailures = useSyncFailureQueue((s) => s.clearAll);

  useEffect(() => {
    hydrateFailures();
  }, [hydrateFailures]);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2 p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <IconBubble icon={Cloud} />
        </div>
        <div className="mt-1 grid gap-2 sm:grid-cols-2 lg:max-w-xl">
          <Button
            variant="outline"
            disabled={syncBusy || !supabase}
            className="min-h-11 justify-start"
            onClick={async () => {
              setSyncBusy(true);
              try {
                await runManualFullSync();
                await refreshPendingDirtyCount();
                toast({ title: t("toasts.syncFinishedTitle"), description: t("toasts.syncFinishedBody") });
              } catch (e: unknown) {
                toast({
                  title: t("toasts.syncErrorTitle"),
                  description: e instanceof Error ? e.message : String(e),
                  variant: "destructive"
                });
              } finally {
                setSyncBusy(false);
              }
            }}
          >
            <RefreshCw className={`h-4 w-4 ${syncBusy ? "animate-spin" : ""}`} />
            {t("actions.syncNow")}
          </Button>
          <Button
            variant="secondary"
            disabled={syncBusy || !supabase}
            className="min-h-11 justify-start"
            onClick={async () => {
              setSyncBusy(true);
              try {
                const r = await runForceFullWorkflowSync();
                await refreshPendingDirtyCount();
                if (r?.ok) {
                  toast({ title: t("toasts.forceSyncCompleteTitle"), description: t("toasts.forceSyncCompleteBody") });
                } else if (r && !r.skipped) {
                  toast({
                    title: t("toasts.forceSyncIssuesTitle"),
                    description: r.errors[0] ?? t("toasts.forceSyncIssuesBodyFallback"),
                    variant: "destructive"
                  });
                }
              } catch (e: unknown) {
                toast({
                  title: t("toasts.forceSyncErrorTitle"),
                  description: e instanceof Error ? e.message : String(e),
                  variant: "destructive"
                });
              } finally {
                setSyncBusy(false);
              }
            }}
          >
            {t("actions.forceFullSync")}
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium">{t("failures.title")}</div>
          {syncFailures.length === 0 ? (
            <div className="rounded-xl border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {t("failures.empty")}
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
                    aria-label={t("failures.dismissAria")}
                    onClick={() => dismissFailure(f.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => clearFailures()}>
                {t("failures.clear")}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
