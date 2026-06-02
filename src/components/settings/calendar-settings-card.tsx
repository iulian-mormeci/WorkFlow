"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { db } from "@/lib/db/workflow-db";
import { saveUserPreferences } from "@/lib/user-settings/user-preferences";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBubble } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { useLiveQuery } from "dexie-react-hooks";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";

export function CalendarSettingsCard() {
  const t = useTranslations("settings.calendar");
  const liveEpoch = useWorkflowLiveEpoch();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, [supabase]);

  const settingsRow = useLiveQuery(
    async () => (userId ? db.userSettings.get(userId) : undefined),
    [userId, liveEpoch]
  );

  const autoExport = settingsRow?.preferences?.calendarAutoExportCompleted ?? false;

  useEffect(() => {
    setSaving(false);
  }, [settingsRow?.updatedAt]);

  async function toggleAutoExport() {
    if (!userId || saving) return;
    setSaving(true);
    try {
      await saveUserPreferences(userId, {
        calendarAutoExportCompleted: !autoExport
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-4 md:p-5">
        <div className="space-y-1">
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </div>
        <IconBubble icon={CalendarPlus} />
      </CardHeader>
      <div className="space-y-2 px-4 pb-4 md:px-5 md:pb-5">
        <div className="grid gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:p-4">
          <div>
            <p className="text-sm font-medium">{t("autoExportLabel")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("autoExportHint")}</p>
            <p className="mt-1.5 text-xs font-medium text-muted-foreground">
              {autoExport ? t("autoExportOn") : t("autoExportOff")}
            </p>
          </div>
          <Button
            type="button"
            variant={autoExport ? "default" : "outline"}
            className="min-h-11 w-full shrink-0 touch-manipulation sm:w-auto"
            disabled={!userId || saving}
            onClick={toggleAutoExport}
          >
            {saving ? t("saving") : autoExport ? t("turnOff") : t("turnOn")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("manualExportHint")}</p>
      </div>
    </Card>
  );
}
