"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2, Plug, RefreshCw } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchUnoErpEvents } from "@/lib/unoerp/fetch-events";
import { useUnoErpEventsStore } from "@/stores/unoerp-events";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBubble } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";

type SyncStatus = "success" | "error" | "running" | null;

type StatusResponse =
  | { connected: false }
  | {
      connected: true;
      baseUrl: string;
      lastSyncAt: string | null;
      lastSyncStatus: SyncStatus;
      lastSyncCount: number;
      lastSyncError: string | null;
    };

const POLL_INTERVAL_MS = 3000;

export function UnoErpIntegrationCard() {
  const t = useTranslations("settings.unoerp");
  const { toast } = useToast();
  const setUnoErpEvents = useUnoErpEventsStore((s) => s.setEvents);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusResponse>({ connected: false });

  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadStatus() {
    const res = await fetch("/api/unoerp/sync/status");
    const data = (await res.json()) as StatusResponse;
    setStatus(data);
    return data;
  }

  useEffect(() => {
    void (async () => {
      await loadStatus();
      setLoading(false);
    })();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function refreshCalendarEvents() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;
    setUnoErpEvents(await fetchUnoErpEvents(supabase, user.id));
  }

  async function handleConnect() {
    if (connecting) return;
    setConnectError(null);

    if (!baseUrl.trim() || !username.trim() || !password) {
      setConnectError(t("errors.invalidInput"));
      return;
    }
    if (!/^https:\/\//i.test(baseUrl.trim())) {
      setConnectError(t("errors.httpsRequired"));
      return;
    }

    setConnecting(true);
    try {
      const res = await fetch("/api/unoerp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: baseUrl.trim(), username: username.trim(), password })
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setConnectError(
          data.error === "auth_failed" ? t("errors.authFailed") : t("errors.genericFailed")
        );
        return;
      }
      setPassword("");
      await loadStatus();
    } catch {
      setConnectError(t("errors.genericFailed"));
    } finally {
      setConnecting(false);
    }
  }

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    // Status starts out `null` (not yet "running") until the background sync's
    // first DB write lands — treating "not running" as "done" here used to stop
    // polling on the very first tick and silently show nothing. Only stop on an
    // actual terminal state (success/error), with a safety cap so a truly stuck
    // background task doesn't poll forever.
    let attempts = 0;
    const maxAttempts = Math.ceil((6 * 60 * 1000) / POLL_INTERVAL_MS);
    pollRef.current = setInterval(async () => {
      attempts += 1;
      const data = await loadStatus();
      const terminal = data.connected && (data.lastSyncStatus === "success" || data.lastSyncStatus === "error");
      if (!terminal && attempts < maxAttempts) return;

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      setSyncing(false);

      if (!terminal) {
        toast({ title: t("syncFailedTitle"), variant: "destructive" });
        return;
      }
      void refreshCalendarEvents();
      if (data.connected && data.lastSyncStatus === "success") {
        toast({
          title: t("syncSuccessTitle"),
          description: t("syncSuccessBody", { count: data.lastSyncCount })
        });
      } else if (data.connected && data.lastSyncStatus === "error") {
        toast({
          title: t("syncFailedTitle"),
          description: data.lastSyncError ?? undefined,
          variant: "destructive"
        });
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleSyncNow() {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/unoerp/sync", { method: "POST" });
      const data = (await res.json()) as { started?: boolean; error?: string; retryAfterSec?: number };
      if (!res.ok || !data.started) {
        setSyncing(false);
        toast({
          title: t("syncFailedTitle"),
          description:
            data.error === "rate_limited"
              ? t("syncRateLimitedBody")
              : data.error === "already_running"
                ? t("syncAlreadyRunningBody")
                : data.error,
          variant: "destructive"
        });
        return;
      }
      startPolling();
    } catch {
      setSyncing(false);
      toast({ title: t("syncFailedTitle"), variant: "destructive" });
    }
  }

  async function handleDisconnect() {
    if (disconnecting) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/unoerp/disconnect", { method: "POST" });
      const data = (await res.json()) as { success?: boolean };
      if (res.ok && data.success) {
        setUnoErpEvents([]);
        setBaseUrl("");
        setUsername("");
        setPassword("");
        await loadStatus();
        setDisconnectOpen(false);
        toast({ title: t("disconnectedTitle") });
      } else {
        toast({ title: t("disconnectFailedTitle"), variant: "destructive" });
      }
    } catch {
      toast({ title: t("disconnectFailedTitle"), variant: "destructive" });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-4 md:p-5">
        <div className="space-y-1">
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </div>
        <IconBubble icon={Plug} />
      </CardHeader>

      <div className="space-y-3 px-4 pb-4 md:px-5 md:pb-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : !status.connected ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t("connectForm.baseUrlLabel")}</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={t("connectForm.baseUrlPlaceholder")}
                inputMode="url"
              />
              <p className="text-xs text-muted-foreground">{t("connectForm.baseUrlHint")}</p>
            </div>
            <div className="grid gap-1.5">
              <Label>{t("connectForm.usernameLabel")}</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("connectForm.passwordLabel")}</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t("connectForm.hidePassword") : t("connectForm.showPassword")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {connectError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
                {connectError}
              </p>
            ) : null}

            <Button
              type="button"
              className="min-h-11 w-full gap-2 sm:w-auto"
              disabled={connecting}
              onClick={() => void handleConnect()}
            >
              {connecting && <Loader2 className="h-4 w-4 animate-spin" />}
              {connecting ? t("connectForm.connecting") : t("connectForm.connectButton")}
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <Badge className="w-fit border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
              ✓ {t("connectedBadge", { baseUrl: status.baseUrl })}
            </Badge>

            {status.lastSyncStatus === "error" ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t("errorBanner", { error: status.lastSyncError ?? "" })}</span>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              {t("lastSyncLabel")}:{" "}
              {status.lastSyncAt
                ? t("lastSyncSummary", {
                    when: new Date(status.lastSyncAt).toLocaleString(),
                    count: status.lastSyncCount
                  })
                : t("lastSyncNever")}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-2"
                disabled={syncing}
                onClick={() => void handleSyncNow()}
              >
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {syncing ? t("syncing") : t("syncNowButton")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 text-red-700 hover:bg-red-50"
                onClick={() => setDisconnectOpen(true)}
              >
                {t("disconnectButton")}
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={disconnectOpen} onOpenChange={(o) => !disconnecting && setDisconnectOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("disconnectDialog.title")}</DialogTitle>
            <DialogDescription>{t("disconnectDialog.body")}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setDisconnectOpen(false)} disabled={disconnecting}>
              {t("disconnectDialog.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={disconnecting}
              className="gap-2"
              onClick={() => void handleDisconnect()}
            >
              {disconnecting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("disconnectDialog.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
