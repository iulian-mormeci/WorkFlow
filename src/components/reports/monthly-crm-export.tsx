"use client";

import { useState } from "react";
import { exportMonthForCrm } from "@/lib/export/crm-export";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

function ym() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function MonthlyCrmExport() {
  const { toast } = useToast();
  const [month, setMonth] = useState(ym());

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">Monthly CRM export</CardTitle>
        <CardDescription>Downloads JSON + CSV for the selected month.</CardDescription>

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
                toast({ title: "Exported", description: "Monthly JSON + CSV downloaded." });
              } catch (e: any) {
                toast({
                  title: "Export failed",
                  description: e?.message ?? "Could not export month",
                  variant: "destructive"
                });
              }
            }}
          >
            Export month
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}

