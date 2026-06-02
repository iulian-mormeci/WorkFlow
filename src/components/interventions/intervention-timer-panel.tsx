"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Pause, Play, Square, Timer } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { syncWorkflowNow } from "@/lib/sync/sync-engine";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { maybeAutoExportCompletedIntervention } from "@/lib/calendar/auto-export-completed";
import { useTranslations } from "next-intl";
import {
  formatElapsedHms,
  getTimerElapsedSeconds,
  isInterventionCompleted,
  normalizeTimerRunState
} from "@/lib/interventions/intervention-helpers";
import {
  analyzeTimerStop,
  loadWorkingHours,
  secondsToHm,
  type TimerStopAnalysis
} from "@/lib/interventions/working-hours";
import { TimerStopDialog, type TimerStopResult } from "@/components/interventions/timer-stop-dialog";

/** Below this, treat "outside hours" as rounding noise and skip the prompt. */
const OUTSIDE_PROMPT_THRESHOLD_SECONDS = 60;

export function InterventionTimerPanel({ interventionId }: { interventionId: string }) {
  const t = useTranslations();
  const { toast } = useToast();
  const iv = useLiveQuery(async () => db.interventions.get(interventionId), [interventionId]);
  const [tick, setTick] = useState(0);
  const [stopAnalysis, setStopAnalysis] = useState<TimerStopAnalysis | null>(null);

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

  /** Persist completion with the final counted minutes (raw tracked time kept truthful). */
  async function finalizeStop(params: {
    countedSeconds: number;
    overtimeSeconds: number;
    trackedSeconds: number;
    endIso: string;
  }) {
    const minutes = params.countedSeconds > 0 ? Math.max(1, Math.round(params.countedSeconds / 60)) : 0;
    await persist({
      timerRunState: "idle",
      timerStartedAt: undefined,
      timerAccumulatedSeconds: params.trackedSeconds,
      durationMinutes: minutes,
      status: "completed",
      endAt: params.endIso
    });
    syncWorkflowNow();

    const supabase = createSupabaseBrowserClient();
    const {
      data: { user }
    } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
    const autoExported = await maybeAutoExportCompletedIntervention(interventionId, user?.id);

    const counted = secondsToHm(params.countedSeconds);
    const ot = secondsToHm(params.overtimeSeconds);
    toast({
      title: autoExported
        ? t("calendar.toasts.autoExportedTitle")
        : t("interventions.timer.toasts.completedTitle"),
      description:
        autoExported
          ? t("calendar.toasts.autoExportedBody")
          : params.overtimeSeconds > 0
            ? t("interventions.timer.toasts.countedBodyOvertime", {
                total: t("interventions.timer.stopDialog.hm", { h: counted.h, m: counted.m }),
                overtime: t("interventions.timer.stopDialog.hm", { h: ot.h, m: ot.m })
              })
            : t("interventions.timer.toasts.countedBody", {
                total: t("interventions.timer.stopDialog.hm", { h: counted.h, m: counted.m })
              })
    });
  }

  /** Entry point for both stop buttons: prompt only when time fell outside hours. */
  async function requestStop(trackedSeconds: number) {
    const endIso = new Date().toISOString();
    const analysis = analyzeTimerStop({
      trackedSeconds,
      stopAtMs: Date.now(),
      config: loadWorkingHours()
    });
    if (analysis.outsideSeconds < OUTSIDE_PROMPT_THRESHOLD_SECONDS) {
      await finalizeStop({
        countedSeconds: trackedSeconds,
        overtimeSeconds: 0,
        trackedSeconds,
        endIso
      });
      return;
    }
    setStopAnalysis(analysis);
  }

  function handleStopConfirm(result: TimerStopResult) {
    const analysis = stopAnalysis;
    setStopAnalysis(null);
    if (!analysis) return;
    void finalizeStop({
      countedSeconds: result.countedSeconds,
      overtimeSeconds: result.overtimeSeconds,
      trackedSeconds: analysis.trackedSeconds,
      endIso: new Date(analysis.windowEndMs).toISOString()
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
              onClick={() => requestStop(getTimerElapsedSeconds(iv))}
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
              onClick={() => requestStop(Math.max(0, Math.floor(iv.timerAccumulatedSeconds ?? 0)))}
            >
              <Square className="h-4 w-4" />
              {t("interventions.timer.actions.stopAndComplete")}
            </Button>
          </>
        ) : null}
      </div>

      <TimerStopDialog
        open={stopAnalysis !== null}
        onOpenChange={(o) => {
          if (!o) setStopAnalysis(null);
        }}
        analysis={stopAnalysis}
        onConfirm={handleStopConfirm}
      />
    </div>
  );
}
