"use client";

import { useEffect, useState } from "react";
import type { Activity } from "@/lib/db/workflow-db";
import { postponeActivity } from "@/lib/activities/activity-mutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function defaultNextDueParts(activity: Activity | null): { date: string; time: string } {
  const base = activity?.dueAt ? new Date(activity.dueAt) : new Date();
  const next = new Date(base);
  // Default: push one day forward from the current due (or now).
  next.setDate(next.getDate() + 1);
  return {
    date: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
    time: `${pad(next.getHours())}:${pad(next.getMinutes())}`
  };
}

function localPartsToIso(date: string, time: string): string | undefined {
  if (!date) return undefined;
  const [y, m, d] = date.split("-").map((v) => Number(v));
  if (!y || !m || !d) return undefined;
  let hh = 9;
  let mm = 0;
  if (time) {
    const [h, min] = time.split(":").map((v) => Number(v));
    if (Number.isFinite(h)) hh = h;
    if (Number.isFinite(min)) mm = min;
  }
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: Activity | null;
  onPostponed?: () => void;
};

export function ActivityPostponeDialog({ open, onOpenChange, activity, onPostponed }: Props) {
  const t = useTranslations();
  const { toast } = useToast();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const parts = defaultNextDueParts(activity ?? null);
    setDate(parts.date);
    setTime(parts.time);
    setReason("");
    setSaving(false);
  }, [open, activity]);

  async function handlePostpone() {
    if (!activity || saving) return;
    setSaving(true);
    try {
      await postponeActivity(activity, {
        newDueAt: localPartsToIso(date, time),
        reason
      });
      toast({
        title: t("activities.toasts.postponedTitle"),
        description: t("activities.toasts.savedLocally")
      });
      onPostponed?.();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: t("activities.toasts.saveFailedTitle"),
        description: e instanceof Error ? e.message : t("common.unknownError"),
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("activities.postpone.title")}</DialogTitle>
          <DialogDescription>
            {activity ? activity.title : t("activities.postpone.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("activities.postpone.newDueDate")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>{t("activities.postpone.newDueTime")}</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={!date}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>{t("activities.postpone.reason")}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={t("activities.postpone.reasonPlaceholder")}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" disabled={saving} onClick={handlePostpone}>
              {saving ? t("common.saving") : t("activities.postpone.confirm")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
