"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
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
import { useTranslations } from "next-intl";
import {
  msToLocalHhmm,
  overtimeSecondsFromRange,
  secondsToHm,
  type TimerStopAnalysis
} from "@/lib/interventions/working-hours";

export type TimerStopResult = {
  /** Final working seconds to record as the intervention duration. */
  countedSeconds: number;
  /** Of which counted as overtime (subset, for the summary). */
  overtimeSeconds: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysis: TimerStopAnalysis | null;
  onConfirm: (result: TimerStopResult) => void;
};

/**
 * Shown only when part of the tracked time fell outside working hours. Lets the
 * user either log the extra time as overtime or cap the duration to working
 * hours, with a live "counted hours" summary before committing.
 */
export function TimerStopDialog({ open, onOpenChange, analysis, onConfirm }: Props) {
  const t = useTranslations("interventions.timer.stopDialog");
  const [overtime, setOvertime] = useState(false);
  const [otStart, setOtStart] = useState("");
  const [otEnd, setOtEnd] = useState("");

  useEffect(() => {
    if (!open || !analysis) return;
    setOvertime(false);
    // Prefill the overtime range with the outside-hours block ending at stop time.
    setOtEnd(msToLocalHhmm(analysis.windowEndMs));
    setOtStart(msToLocalHhmm(analysis.windowEndMs - analysis.outsideSeconds * 1000));
  }, [open, analysis]);

  const overtimeSeconds = useMemo(
    () => (overtime ? overtimeSecondsFromRange(otStart, otEnd) : 0),
    [overtime, otStart, otEnd]
  );

  if (!analysis) return null;

  const countedSeconds = analysis.withinSeconds + overtimeSeconds;
  const tracked = secondsToHm(analysis.trackedSeconds);
  const within = secondsToHm(analysis.withinSeconds);
  const outside = secondsToHm(analysis.outsideSeconds);
  const counted = secondsToHm(countedSeconds);
  const ot = secondsToHm(overtimeSeconds);
  const overtimeInvalid = overtime && overtimeSeconds <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-2 rounded-xl border bg-muted/30 p-3 text-sm">
            <Row label={t("tracked")} value={t("hm", { h: tracked.h, m: tracked.m })} />
            <Row label={t("withinHours")} value={t("hm", { h: within.h, m: within.m })} />
            <Row
              label={t("outsideHours")}
              value={t("hm", { h: outside.h, m: outside.m })}
              emphasize
            />
          </div>

          <div className="grid gap-2">
            <Label>{t("overtimeQuestion")}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={overtime ? "default" : "outline"}
                onClick={() => setOvertime(true)}
                className="min-h-12 touch-manipulation"
              >
                {t("overtimeYes")}
              </Button>
              <Button
                type="button"
                variant={!overtime ? "default" : "outline"}
                onClick={() => setOvertime(false)}
                className="min-h-12 touch-manipulation"
              >
                {t("overtimeNo")}
              </Button>
            </div>
          </div>

          {overtime ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("overtimeStart")}</Label>
                <Input
                  type="time"
                  value={otStart}
                  onChange={(e) => setOtStart(e.target.value)}
                  className="min-h-12 touch-manipulation text-base"
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("overtimeEnd")}</Label>
                <Input
                  type="time"
                  value={otEnd}
                  onChange={(e) => setOtEnd(e.target.value)}
                  className="min-h-12 touch-manipulation text-base"
                />
              </div>
              {overtimeInvalid ? (
                <p className="sm:col-span-2 text-xs text-destructive">{t("overtimeInvalid")}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("noOvertimeNote")}</p>
          )}

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm font-medium">
            <Clock className="mr-2 inline h-4 w-4 text-primary" />
            {overtimeSeconds > 0
              ? t("countedWithOvertime", {
                  total: t("hm", { h: counted.h, m: counted.m }),
                  overtime: t("hm", { h: ot.h, m: ot.m })
                })
              : t("counted", { total: t("hm", { h: counted.h, m: counted.m }) })}
          </div>

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              disabled={overtimeInvalid}
              onClick={() => onConfirm({ countedSeconds, overtimeSeconds })}
              className="min-h-12 touch-manipulation"
            >
              {t("confirm")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={emphasize ? "font-semibold text-foreground" : "font-medium tabular-nums"}>
        {value}
      </span>
    </div>
  );
}
