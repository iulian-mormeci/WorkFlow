"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Pause, Play, Square, Timer } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { syncWorkflowNow } from "@/lib/sync/sync-engine";
import { useTranslations } from "next-intl";
import {
  formatElapsedHms,
  getTimerElapsedSeconds,
  isInterventionCompleted,
  normalizeTimerRunState
} from "@/lib/interventions/intervention-helpers";

export function InterventionTimerPanel({ interventionId }: { interventionId: string }) {
  const t = useTranslations();
  const { toast } = useToast();
  const iv = useLiveQuery(async () => db.interventions.get(interventionId), [interventionId]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  if (!iv) return null;
  if (isInterventionCompleted(iv)) return null;
  // Timer is meaningful only when the visit has a start time.
  if (!iv.startAt) return null;

  const state = normalizeTimerRunState(iv);
  void tick;
  const elapsed = getTimerElapsedSeconds(iv);

  async function persist(patch: Record<string, unknown>) {
    const nowIso = new Date().toISOString();
    await db.interventions.update(interventionId, {
      ...patch,
      updatedAt: nowIso
    });
  }

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Timer className="h-4 w-4 text-muted-foreground" />
          {t("interventions.timer.title")}
        </div>
        <div className="font-mono text-2xl tabular-nums tracking-tight">{formatElapsedHms(elapsed)}</div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {state === "running"
          ? t("interventions.timer.state.running")
          : state === "paused"
            ? t("interventions.timer.state.paused")
            : t("interventions.timer.state.idle")}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {state === "idle" ? (
          <Button
            type="button"
            onClick={async () => {
              await persist({
                timerRunState: "running",
                timerStartedAt: new Date().toISOString(),
                timerAccumulatedSeconds: Math.max(0, Math.floor(iv.timerAccumulatedSeconds ?? 0)),
                status: "in_progress"
              });
              syncWorkflowNow();
              toast({ title: t("interventions.timer.toasts.started") });
            }}
          >
            <Play className="h-4 w-4" />
            {t("interventions.timer.actions.start")}
          </Button>
        ) : null}

        {state === "running" ? (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                const acc = getTimerElapsedSeconds(iv);
                await persist({
                  timerRunState: "paused",
                  timerStartedAt: undefined,
                  timerAccumulatedSeconds: acc,
                  status: "in_progress"
                });
                syncWorkflowNow();
                toast({
                  title: t("interventions.timer.toasts.pausedTitle"),
                  description: t("interventions.timer.toasts.pausedBody")
                });
              }}
            >
              <Pause className="h-4 w-4" />
              {t("interventions.timer.actions.pause")}
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={async () => {
                const acc = getTimerElapsedSeconds(iv);
                const endIso = new Date().toISOString();
                await persist({
                  timerRunState: "idle",
                  timerStartedAt: undefined,
                  timerAccumulatedSeconds: acc,
                  durationMinutes: Math.max(1, Math.round(acc / 60)),
                  status: "completed",
                  endAt: endIso
                });
                syncWorkflowNow();
                toast({
                  title: t("interventions.timer.toasts.completedTitle"),
                  description: t("interventions.timer.toasts.completedBodyWithDuration", {
                    duration: formatElapsedHms(acc)
                  })
                });
              }}
            >
              <Square className="h-4 w-4" />
              {t("interventions.timer.actions.stopAndComplete")}
            </Button>
          </>
        ) : null}

        {state === "paused" ? (
          <>
            <Button
              type="button"
              onClick={async () => {
                await persist({
                  timerRunState: "running",
                  timerStartedAt: new Date().toISOString(),
                  status: "in_progress"
                });
                syncWorkflowNow();
                toast({ title: t("interventions.timer.toasts.resumed") });
              }}
            >
              <Play className="h-4 w-4" />
              {t("interventions.timer.actions.resume")}
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={async () => {
                const acc = Math.max(0, Math.floor(iv.timerAccumulatedSeconds ?? 0));
                const endIso = new Date().toISOString();
                await persist({
                  timerRunState: "idle",
                  timerStartedAt: undefined,
                  timerAccumulatedSeconds: acc,
                  durationMinutes: Math.max(1, Math.round(acc / 60)),
                  status: "completed",
                  endAt: endIso
                });
                syncWorkflowNow();
                toast({
                  title: t("interventions.timer.toasts.completedTitle"),
                  description: t("interventions.timer.toasts.completedBodyFromTracked")
                });
              }}
            >
              <Square className="h-4 w-4" />
              {t("interventions.timer.actions.stopAndComplete")}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
