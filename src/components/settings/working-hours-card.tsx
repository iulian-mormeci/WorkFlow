"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
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
  loadWorkingHours,
  normalizeWorkingHours,
  saveWorkingHoursLocal,
  type WorkingHoursConfig
} from "@/lib/interventions/working-hours";

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
      hasLocal = Boolean(window.localStorage.getItem("workflow:workingHours:v1"));
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

  function updateDay(index: number, patch: Partial<WorkingHoursConfig["days"][number]>) {
    setConfig((prev) => {
      const days = prev.days.map((d, i) => (i === index ? { ...d, ...patch } : { ...d }));
      // In shared mode, propagate time edits to every day so all stay in sync.
      if (!prev.perDay && (patch.start !== undefined || patch.end !== undefined)) {
        for (let i = 0; i < days.length; i++) {
          if (patch.start !== undefined) days[i].start = patch.start;
          if (patch.end !== undefined) days[i].end = patch.end;
        }
      }
      return { ...prev, days };
    });
  }

  const shared = config.days[0] ?? DEFAULT_WORKING_HOURS.days[0];

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const next = normalizeWorkingHours(config);
    saveWorkingHoursLocal(next);
    setConfig(next);
    try {
      if (supabase) {
        await supabase.auth.updateUser({ data: { working_hours: next } });
      }
    } catch {
      /* offline / auth error — local copy still works */
    } finally {
      setSaving(false);
    }
    toast({ title: t("savedTitle"), description: t("savedBody") });
  }

  return (
    <Card className="rounded-2xl lg:col-span-2">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <IconBubble icon={Clock} />
        </div>

        {!config.perDay ? (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("startLabel")}</Label>
              <Input
                type="time"
                value={shared.start}
                onChange={(e) => updateDay(0, { start: e.target.value })}
                className="min-h-12 touch-manipulation text-base"
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("endLabel")}</Label>
              <Input
                type="time"
                value={shared.end}
                onChange={(e) => updateDay(0, { end: e.target.value })}
                className="min-h-12 touch-manipulation text-base"
              />
            </div>
          </div>
        ) : null}

        <div className="mt-3 grid gap-2">
          <Label>{t("daysLabel")}</Label>
          <div className="grid gap-2">
            {WEEKDAY_KEYS.map((key, index) => {
              const day = config.days[index];
              return (
                <div
                  key={key}
                  className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2"
                >
                  <label className="flex min-w-28 cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={day.enabled}
                      onCheckedChange={(v) => updateDay(index, { enabled: v === true })}
                    />
                    {t(`dayLong.${key}`)}
                  </label>
                  {config.perDay ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={day.start}
                        disabled={!day.enabled}
                        onChange={(e) => updateDay(index, { start: e.target.value })}
                        className="h-11 w-28 touch-manipulation"
                        aria-label={`${t(`dayLong.${key}`)} ${t("startLabel")}`}
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="time"
                        value={day.end}
                        disabled={!day.enabled}
                        onChange={(e) => updateDay(index, { end: e.target.value })}
                        className="h-11 w-28 touch-manipulation"
                        aria-label={`${t(`dayLong.${key}`)} ${t("endLabel")}`}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
          <div>
            <div className="text-sm font-medium">{t("perDayLabel")}</div>
            <div className="text-xs text-muted-foreground">{t("perDayHint")}</div>
          </div>
          <Button
            type="button"
            variant={config.perDay ? "default" : "outline"}
            onClick={() => setConfig((prev) => ({ ...prev, perDay: !prev.perDay }))}
            className="min-h-11 touch-manipulation"
          >
            {config.perDay ? t("perDayOn") : t("perDayOff")}
          </Button>
        </div>

        <div className="mt-3 flex justify-end">
          <Button type="button" disabled={saving} onClick={handleSave} className="min-h-12 touch-manipulation">
            {saving ? t("saving") : t("saveButton")}
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}
