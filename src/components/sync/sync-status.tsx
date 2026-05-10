"use client";

import { useEffect, useMemo, useState } from "react";
import { Cloud, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/hooks/use-online-status";
import {
  refreshPendingDirtyCount,
  runManualFullSync
} from "@/lib/sync/sync-engine";
import { useSyncUiStore } from "@/stores/sync-ui";
import { cn } from "@/lib/utils";

function formatRelative(ms: number | null, now: number | null) {
  if (ms == null || now == null) return null;
  const s = Math.floor((now - ms) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} hr ago`;
}

export function SyncStatus() {
  const online = useOnlineStatus();
  const phase = useSyncUiStore((s) => s.phase);
  const lastRealtimeAt = useSyncUiStore((s) => s.lastRealtimeAt);
  const lastSuccessfulSyncAt = useSyncUiStore((s) => s.lastSuccessfulSyncAt);
  const lastSyncError = useSyncUiStore((s) => s.lastSyncError);
  const dirtyCount = useSyncUiStore((s) => s.dirtyCount);
  const [tick, setTick] = useState(0);
  /** Null until mount so relative “ago” strings match SSR + first client paint. */
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [manualBusy, setManualBusy] = useState(false);

  useEffect(() => {
    void refreshPendingDirtyCount();
    const bump = () => setNowMs(Date.now());
    bump();
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
      bump();
      void refreshPendingDirtyCount();
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const headline = useMemo(() => {
    void tick;
    if (!online) {
      return {
        icon: CloudOff,
        tone: "amber" as const,
        title: "Offline",
        subtitle:
          dirtyCount > 0
            ? `${dirtyCount} change${dirtyCount === 1 ? "" : "s"} queued — will sync when you reconnect`
            : "No pending changes"
      };
    }
    if (phase === "syncing") {
      return {
        icon: Loader2,
        tone: "blue" as const,
        title: "Syncing",
        subtitle: "Uploading and merging with the cloud…"
      };
    }
    if (phase === "offline_pending" && online) {
      return {
        icon: Cloud,
        tone: "amber" as const,
        title: "Catching up",
        subtitle: "Finishing queued changes…"
      };
    }
    const rtAgo = formatRelative(lastRealtimeAt, nowMs);
    if (lastRealtimeAt && nowMs != null && nowMs - lastRealtimeAt < 12_000) {
      return {
        icon: Cloud,
        tone: "emerald" as const,
        title: "Live",
        subtitle: "Cloud updated just now"
      };
    }
    if (rtAgo && lastRealtimeAt) {
      return {
        icon: Cloud,
        tone: "muted" as const,
        title: "Live",
        subtitle: `Last cloud update ${rtAgo}`
      };
    }
    const syncAgo = formatRelative(lastSuccessfulSyncAt, nowMs);
    if (syncAgo && lastSuccessfulSyncAt) {
      return {
        icon: Cloud,
        tone: "emerald" as const,
        title: "Synced",
        subtitle: `Full sync ${syncAgo}`
      };
    }
    return {
      icon: Cloud,
      tone: "muted" as const,
      title: "Ready",
      subtitle: "Signed in — sync runs in the background"
    };
  }, [online, phase, lastRealtimeAt, lastSuccessfulSyncAt, dirtyCount, tick, nowMs]);

  const Icon = headline.icon;
  const spin = phase === "syncing";

  const ring =
    headline.tone === "emerald"
      ? "border-emerald-200/80 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/30"
      : headline.tone === "amber"
        ? "border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/25"
        : headline.tone === "blue"
          ? "border-blue-200/80 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/25"
          : "border-border bg-muted/50";

  const titleClass =
    headline.tone === "emerald"
      ? "text-emerald-900 dark:text-emerald-100"
      : headline.tone === "amber"
        ? "text-amber-900 dark:text-amber-100"
        : headline.tone === "blue"
          ? "text-blue-900 dark:text-blue-100"
          : "text-foreground";

  async function onManualSync() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setManualBusy(true);
    try {
      await runManualFullSync();
      await refreshPendingDirtyCount();
    } finally {
      setManualBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "mt-4 space-y-3 rounded-2xl border p-3 text-xs shadow-sm",
        ring
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-background/80",
            spin && "border-primary/30"
          )}
        >
          <Icon className={cn("h-4 w-4 text-muted-foreground", spin && "animate-spin text-primary")} />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className={cn("text-sm font-semibold leading-tight", titleClass)}>{headline.title}</div>
          <p className="text-[11px] leading-snug text-muted-foreground">{headline.subtitle}</p>
        </div>
      </div>

      {lastSyncError && online && phase !== "syncing" ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">
          {lastSyncError}
        </div>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-9 w-full rounded-xl text-xs font-medium"
        disabled={manualBusy || !online}
        onClick={() => void onManualSync()}
      >
        <RefreshCw className={cn("mr-2 h-3.5 w-3.5", manualBusy && "animate-spin")} />
        {manualBusy ? "Syncing…" : "Sync now"}
      </Button>
    </div>
  );
}
