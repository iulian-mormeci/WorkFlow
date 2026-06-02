"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Clock, Cloud, CloudOff, Coffee, Loader2, Plus, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { db } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconBubble } from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";
import {
  ensureUserSettingsRow,
  saveUserWorkingHours
} from "@/lib/user-settings/working-hours-sync";
import {
  DEFAULT_WORKING_HOURS,
  WEEKDAY_KEYS,
  cloneConfig,
  dayScheduledMinutes,
  hhmmToMinutes,
  loadWorkingHours,
  normalizeWorkingHours,
  secondsToHm,
  type TimeRange,
  type WorkingHoursConfig
} from "@/lib/interventions/working-hours";
import type { UserSettings } from "@/lib/db/workflow-db";

type Schedule = { slots: TimeRange[]; breaks: TimeRange[] };

function isSettingsPendingSync(row: UserSettings | undefined): boolean {
  if (!row) return true;
  if (!row.syncedAt) return true;
  return new Date(row.updatedAt).getTime() > new Date(row.syncedAt).getTime();
}

function formatRelativeSynced(
  iso: string,
  tRel: ReturnType<typeof useTranslations<"syncStatus">>
): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return tRel("relative.justNow");
  const sec = Math.floor(ms / 1000);
  if (sec < 45) return tRel("relative.justNow");
  if (sec < 3600) return tRel("relative.secondsAgo", { seconds: sec });
  const min = Math.floor(sec / 60);
  if (min < 120) return tRel("relative.minutesAgo", { minutes: min });
  const hr = Math.floor(min / 60);
  return tRel("relative.hoursAgo", { hours: hr });
}

export function WorkingHoursCard() {
  const t = useTranslations("settings.workingHours");
  const tSync = useTranslations("settings.workingHours.sync");
  const tRel = useTranslations("syncStatus");
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [config, setConfig] = useState<WorkingHoursConfig>(() => loadWorkingHours());
  const [saving, setSaving] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  const settingsRow = useLiveQuery(
    async () => (userId ? db.userSettings.get(userId) : undefined),
    [userId, liveEpoch]
  );

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      setUserId(user.id);
      await ensureUserSettingsRow(user.id, {
        seedFromLocalStorage: true,
        legacyMetadata: user.user_metadata?.working_hours
      });
      if (!cancelled) setBootstrapped(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!settingsRow?.workingHours || saving) return;
    setConfig(cloneConfig(settingsRow.workingHours));
  }, [settingsRow, saving]);

  const pendingSync = isSettingsPendingSync(settingsRow);
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;

  function toggleDayEnabled(index: number) {
    setConfig((prev) => ({
      ...prev,
      days: prev.days.map((d, i) => (i === index ? { ...d, enabled: !d.enabled } : d))
    }));
  }

  function setSchedule(index: number, next: Schedule) {
    setConfig((prev) => {
      const clone = (s: Schedule): Schedule => ({
        slots: s.slots.map((r) => ({ ...r })),
        breaks: s.breaks.map((r) => ({ ...r }))
      });
      return {
        ...prev,
        days: prev.days.map((d, i) => {
          if (prev.perDay) {
            return i === index ? { ...d, ...next } : d;
          }
          const c = clone(next);
          return { ...d, slots: c.slots, breaks: c.breaks };
        })
      };
    });
  }

  function setPerDay(perDay: boolean) {
    setConfig((prev) => {
      if (perDay) return { ...prev, perDay };
      const template = prev.days.find((d) => d.enabled) ?? prev.days[0];
      return {
        ...prev,
        perDay,
        days: prev.days.map((d) => ({
          ...d,
          slots: template.slots.map((r) => ({ ...r })),
          breaks: template.breaks.map((r) => ({ ...r }))
        }))
      };
    });
  }

  async function handleSave() {
    if (saving || !userId) return;
    setSaving(true);
    const next = normalizeWorkingHours(config);
    try {
      await saveUserWorkingHours(userId, next);
      setConfig(next);
      scheduleWorkflowSync();
      toast({ title: t("savedTitle"), description: t("savedBody") });
    } catch (e) {
      toast({
        title: t("saveFailedTitle"),
        description: e instanceof Error ? e.message : t("saveFailedBody"),
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }

  const sharedTemplate = config.days[0] ?? DEFAULT_WORKING_HOURS.days[0];

  return (
    <Card className="rounded-2xl lg:col-span-2">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <IconBubble icon={Clock} />
        </div>

        <WorkingHoursSyncBadge
          bootstrapped={bootstrapped}
          pending={pendingSync}
          online={online}
          syncedWhen={
            settingsRow?.syncedAt ? formatRelativeSynced(settingsRow.syncedAt, tRel) : null
          }
          t={tSync}
        />

        <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
          <div>
            <div className="text-sm font-medium">{t("perDayLabel")}</div>
            <div className="text-xs text-muted-foreground">{t("perDayHint")}</div>
          </div>
          <Button
            type="button"
            variant={config.perDay ? "default" : "outline"}
            onClick={() => setPerDay(!config.perDay)}
            className="min-h-11 touch-manipulation"
          >
            {config.perDay ? t("perDayOn") : t("perDayOff")}
          </Button>
        </div>

        {!config.perDay ? (
          <div className="rounded-xl border bg-muted/20 p-3">
            <ScheduleEditor schedule={sharedTemplate} onChange={(s) => setSchedule(0, s)} />
            <DayTimeline slots={sharedTemplate.slots} breaks={sharedTemplate.breaks} />
          </div>
        ) : null}

        <div className="grid gap-2">
          <Label>{t("daysLabel")}</Label>
          <div className="grid gap-2">
            {WEEKDAY_KEYS.map((key, index) => {
              const day = config.days[index];
              return (
                <div key={key} className="rounded-xl border bg-muted/30 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <Checkbox
                        checked={day.enabled}
                        onCheckedChange={() => toggleDayEnabled(index)}
                      />
                      {t(`dayLong.${key}`)}
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {day.enabled ? formatHm(dayScheduledMinutes(day), t) : t("dayOff")}
                    </span>
                  </div>

                  {config.perDay && day.enabled ? (
                    <div className="mt-3 border-t pt-3">
                      <ScheduleEditor schedule={day} onChange={(s) => setSchedule(index, s)} />
                      <DayTimeline slots={day.slots} breaks={day.breaks} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={saving || !userId}
            onClick={handleSave}
            className="min-h-12 touch-manipulation"
          >
            {saving ? t("saving") : t("saveButton")}
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}

function WorkingHoursSyncBadge({
  bootstrapped,
  pending,
  online,
  syncedWhen,
  t
}: {
  bootstrapped: boolean;
  pending: boolean;
  online: boolean;
  syncedWhen: string | null;
  t: ReturnType<typeof useTranslations<"settings.workingHours.sync">>;
}) {
  if (!bootstrapped) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("loading")}
      </div>
    );
  }
  if (!online) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <CloudOff className="h-4 w-4 shrink-0" />
        <span>{t("offline")}</span>
      </div>
    );
  }
  if (pending) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <span>{t("pending")}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
      <Cloud className="h-4 w-4 shrink-0" />
      <span>{syncedWhen ? t("syncedAt", { when: syncedWhen }) : t("synced")}</span>
    </div>
  );
}

/** Editor for one day's working slots and breaks. */
function ScheduleEditor({
  schedule,
  onChange
}: {
  schedule: Schedule;
  onChange: (next: Schedule) => void;
}) {
  const t = useTranslations("settings.workingHours");

  function updateRange(kind: "slots" | "breaks", i: number, patch: Partial<TimeRange>) {
    onChange({
      ...schedule,
      [kind]: schedule[kind].map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    });
  }
  function addRange(kind: "slots" | "breaks") {
    const fallback: TimeRange =
      kind === "slots" ? { start: "09:00", end: "13:00" } : { start: "13:00", end: "14:00" };
    onChange({ ...schedule, [kind]: [...schedule[kind], fallback] });
  }
  function removeRange(kind: "slots" | "breaks", i: number) {
    onChange({ ...schedule, [kind]: schedule[kind].filter((_, idx) => idx !== i) });
  }

  return (
    <div className="grid gap-4">
      <RangeList
        title={t("slotsLabel")}
        rows={schedule.slots}
        emptyHint={t("slotsEmpty")}
        addLabel={t("addSlot")}
        onAdd={() => addRange("slots")}
        onRemove={(i) => removeRange("slots", i)}
        onChange={(i, patch) => updateRange("slots", i, patch)}
        removeAria={t("removeSlot")}
      />
      <RangeList
        title={t("breaksLabel")}
        icon={<Coffee className="h-4 w-4 text-amber-500" />}
        rows={schedule.breaks}
        emptyHint={t("breaksEmpty")}
        addLabel={t("addBreak")}
        onAdd={() => addRange("breaks")}
        onRemove={(i) => removeRange("breaks", i)}
        onChange={(i, patch) => updateRange("breaks", i, patch)}
        removeAria={t("removeBreak")}
      />
    </div>
  );
}

function RangeList({
  title,
  icon,
  rows,
  emptyHint,
  addLabel,
  onAdd,
  onRemove,
  onChange,
  removeAria
}: {
  title: string;
  icon?: ReactNode;
  rows: TimeRange[];
  emptyHint: string;
  addLabel: string;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChange: (i: number, patch: Partial<TimeRange>) => void;
  removeAria: string;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((r, i) => {
            const invalid = !rangeIsValid(r);
            return (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="time"
                  value={r.start}
                  onChange={(e) => onChange(i, { start: e.target.value })}
                  className={`h-11 w-28 touch-manipulation ${invalid ? "border-destructive" : ""}`}
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time"
                  value={r.end}
                  onChange={(e) => onChange(i, { end: e.target.value })}
                  className={`h-11 w-28 touch-manipulation ${invalid ? "border-destructive" : ""}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground"
                  aria-label={removeAria}
                  onClick={() => onRemove(i)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAdd}
        className="w-fit min-h-10 touch-manipulation"
      >
        <Plus className="h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}

function DayTimeline({ slots, breaks }: { slots: TimeRange[]; breaks: TimeRange[] }) {
  const toPct = (m: number) => (m / (24 * 60)) * 100;
  const bars = (rows: TimeRange[]) =>
    rows
      .map((r) => {
        const s = hhmmToMinutes(r.start);
        const e = hhmmToMinutes(r.end);
        if (s == null || e == null || e <= s) return null;
        return { left: toPct(s), width: toPct(e - s) };
      })
      .filter((x): x is { left: number; width: number } => x !== null);

  return (
    <div className="mt-3">
      <div className="relative h-7 w-full overflow-hidden rounded-lg border bg-muted">
        {bars(slots).map((b, i) => (
          <div
            key={`s-${i}`}
            className="absolute inset-y-0 bg-emerald-500/70"
            style={{ left: `${b.left}%`, width: `${b.width}%` }}
          />
        ))}
        {bars(breaks).map((b, i) => (
          <div
            key={`b-${i}`}
            className="absolute inset-y-1 rounded-sm bg-amber-400/90"
            style={{ left: `${b.left}%`, width: `${b.width}%` }}
          />
        ))}
        {[6, 12, 18].map((h) => (
          <div
            key={h}
            className="absolute inset-y-0 w-px bg-border"
            style={{ left: `${toPct(h * 60)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>0</span>
        <span>6</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}

function rangeIsValid(r: TimeRange): boolean {
  const s = hhmmToMinutes(r.start);
  const e = hhmmToMinutes(r.end);
  return s != null && e != null && e > s;
}

function formatHm(totalMinutes: number, t: ReturnType<typeof useTranslations>): string {
  const { h, m } = secondsToHm(totalMinutes * 60);
  return t("hm", { h, m });
}
