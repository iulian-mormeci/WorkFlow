"use client";

import { useState } from "react";
import { exportMonthForCrm } from "@/lib/export/crm-export";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";

function ym() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function MonthlyCrmExport() {
  const t = useTranslations();
  const { toast } = useToast();
  const [month, setMonth] = useState(ym());

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">{t("reports.monthlyCrmExport.title")}</CardTitle>
        <CardDescription>{t("reports.monthlyCrmExport.subtitle")}</CardDescription>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            className="h-11 rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <Button
            onClick={async () => {
              try {
                const [y, m] = month.split("-").map((x) => Number(x));
                await exportMonthForCrm(y, m - 1);
                toast({
                  title: t("reports.monthlyCrmExport.toasts.exportedTitle"),
                  description: t("reports.monthlyCrmExport.toasts.exportedBody")
                });
              } catch (e: any) {
                toast({
                  title: t("reports.monthlyCrmExport.toasts.exportFailedTitle"),
                  description: e?.message ?? t("reports.monthlyCrmExport.toasts.exportFailedBody"),
                  variant: "destructive"
                });
              }
            }}
          >
            {t("reports.monthlyCrmExport.actions.exportMonth")}
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}

