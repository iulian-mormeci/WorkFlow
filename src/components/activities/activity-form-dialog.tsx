"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import {
  ACTIVITY_PRIORITIES,
  ACTIVITY_STATUSES,
  type Activity,
  type ReminderPreset
} from "@/lib/db/workflow-db";
import {
  createActivity,
  updateActivity,
  type ActivityFormValues
} from "@/lib/activities/activity-mutations";
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

const REMINDER_PRESETS: readonly ReminderPreset[] = ["1d", "2h", "30m", "custom"] as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Split an ISO instant into local `yyyy-mm-dd` and `HH:mm` parts for the inputs. */
function isoToLocalParts(iso?: string): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}

/** Combine local date + optional time into an ISO instant (defaults to 09:00). */
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
  /** Provide to edit; omit to create a new activity. */
  activity?: Activity | null;
  onSaved?: () => void;
};

export function ActivityFormDialog({ open, onOpenChange, activity, onSaved }: Props) {
  const t = useTranslations();
  const { toast } = useToast();
  const isEdit = Boolean(activity);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderPreset, setReminderPreset] = useState<ReminderPreset>("2h");
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [status, setStatus] = useState<Activity["status"]>("open");
  const [priority, setPriority] = useState<Activity["priority"]>("medium");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const due = isoToLocalParts(activity?.dueAt);
    const custom = isoToLocalParts(activity?.reminderCustomAt);
    setTitle(activity?.title ?? "");
    setDescription(activity?.description ?? "");
    setDueDate(due.date);
    setDueTime(due.time);
    setRemindersEnabled(activity?.remindersEnabled ?? false);
    setReminderPreset(activity?.reminderPreset ?? "2h");
    setCustomDate(custom.date);
    setCustomTime(custom.time);
    setStatus(activity?.status ?? "open");
    setPriority(activity?.priority ?? "medium");
    setCategory(activity?.category ?? "");
    setSaving(false);
  }, [open, activity]);

  const canSave = useMemo(() => title.trim().length > 1, [title]);

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    const dueAt = localPartsToIso(dueDate, dueTime);
    const reminderCustomAt =
      remindersEnabled && reminderPreset === "custom"
        ? localPartsToIso(customDate, customTime)
        : undefined;

    const values: ActivityFormValues = {
      title,
      description,
      dueAt,
      remindersEnabled,
      reminderPreset,
      reminderCustomAt,
      status,
      priority,
      category
    };

    try {
      if (activity) {
        await updateActivity(activity, values);
        toast({
          title: t("activities.toasts.updatedTitle"),
          description: t("activities.toasts.savedLocally")
        });
      } else {
        await createActivity(values);
        toast({
          title: t("activities.toasts.createdTitle"),
          description: t("activities.toasts.savedLocally")
        });
      }
      onSaved?.();
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("activities.form.editTitle") : t("activities.form.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("activities.form.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <Label>{t("activities.fields.title")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("activities.fields.titlePlaceholder")}
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label>{t("activities.fields.description")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("activities.fields.descriptionPlaceholder")}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("activities.fields.dueDate")}</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>{t("activities.fields.dueTime")}</Label>
              <Input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                disabled={!dueDate}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>{t("activities.fields.priority")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {ACTIVITY_PRIORITIES.map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={priority === p ? "default" : "outline"}
                  onClick={() => setPriority(p)}
                >
                  {t(`activities.priority.${p}`)}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>{t("activities.fields.status")}</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ACTIVITY_STATUSES.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={status === s ? "default" : "outline"}
                  onClick={() => setStatus(s)}
                >
                  {t(`activities.status.${s}`)}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>{t("activities.fields.category")}</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t("activities.fields.categoryPlaceholder")}
            />
          </div>

          <div className="rounded-xl border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {remindersEnabled ? (
                  <Bell className="h-4 w-4 text-primary" />
                ) : (
                  <BellOff className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <div className="text-sm font-medium">{t("activities.fields.reminders")}</div>
                  <div className="text-xs text-muted-foreground">
                    {dueDate
                      ? t("activities.fields.remindersHint")
                      : t("activities.fields.remindersNeedsDue")}
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant={remindersEnabled ? "default" : "outline"}
                onClick={() => setRemindersEnabled((v) => !v)}
                disabled={!dueDate}
              >
                {remindersEnabled ? t("common.on") : t("common.off")}
              </Button>
            </div>

            {remindersEnabled && dueDate ? (
              <div className="mt-3 grid gap-2">
                <Label>{t("activities.fields.reminderPreset")}</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {REMINDER_PRESETS.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant={reminderPreset === p ? "default" : "outline"}
                      onClick={() => setReminderPreset(p)}
                    >
                      {t(`activities.reminderPresets.${p}`)}
                    </Button>
                  ))}
                </div>
                {reminderPreset === "custom" ? (
                  <div className="mt-1 grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>{t("activities.fields.reminderCustomDate")}</Label>
                      <Input
                        type="date"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>{t("activities.fields.reminderCustomTime")}</Label>
                      <Input
                        type="time"
                        value={customTime}
                        onChange={(e) => setCustomTime(e.target.value)}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" disabled={!canSave || saving} onClick={handleSave}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
