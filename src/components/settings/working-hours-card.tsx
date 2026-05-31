"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Clock, Coffee, Plus, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconBubble } from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import {
  DEFAULT_WORKING_HOURS,
  WEEKDAY_KEYS,
  WORKING_HOURS_STORAGE_KEY,
  dayScheduledMinutes,
  hhmmToMinutes,
  loadWorkingHours,
  normalizeWorkingHours,
  saveWorkingHoursLocal,
  secondsToHm,
  type TimeRange,
  type WorkingHoursConfig
} from "@/lib/interventions/working-hours";

type Schedule = { slots: TimeRange[]; breaks: TimeRange[] };

export function WorkingHoursCard() {
  const t = useTranslations("settings.workingHours");
  const { toast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [config, setConfig] = useState<WorkingHoursConfig>(() => loadWorkingHours());
  const [saving, setSaving] = useState(false);

  // Hydrate from cloud only when nothing is stored locally yet.
  useEffect(() => {
    if (!supabase) return;
    let hasLocal = false;
    try {
      hasLocal = Boolean(window.localStorage.getItem(WORKING_HOURS_STORAGE_KEY));
    } catch {
      /* ignore */
    }
    if (hasLocal) return;
    let cancelled = false;
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const meta = user.user_metadata?.working_hours;
      if (meta && typeof meta === "object") {
        const next = normalizeWorkingHours(meta);
        setConfig(next);
        saveWorkingHoursLocal(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  function toggleDayEnabled(index: number) {
    setConfig((prev) => ({
      ...prev,
      days: prev.days.map((d, i) => (i === index ? { ...d, enabled: !d.enabled } : d))
    }));
  }

  /** Apply a schedule (slots + breaks) to one day, or to all days in shared mode. */
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
      // Collapsing to shared: adopt the first enabled day's schedule everywhere.
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
    if (saving) return;
    setSaving(true);
    const next = normalizeWorkingHours(config);
    saveWorkingHoursLocal(next);
    setConfig(next);
    try {
      if (supabase) await supabase.auth.updateUser({ data: { working_hours: next } });
    } catch {
      /* offline / auth error — local copy still works */
    } finally {
      setSaving(false);
    }
    toast({ title: t("savedTitle"), description: t("savedBody") });
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

        {/* Per-day toggle */}
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

        {/* Shared schedule editor */}
        {!config.perDay ? (
          <div className="rounded-xl border bg-muted/20 p-3">
            <ScheduleEditor
              schedule={sharedTemplate}
              onChange={(s) => setSchedule(0, s)}
            />
            <DayTimeline slots={sharedTemplate.slots} breaks={sharedTemplate.breaks} />
          </div>
        ) : null}

        {/* Days */}
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
            disabled={saving}
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
    const fallback: TimeRange = kind === "slots" ? { start: "09:00", end: "13:00" } : { start: "13:00", end: "14:00" };
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

/** 24h horizontal preview: green = working slots, amber = breaks. */
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
