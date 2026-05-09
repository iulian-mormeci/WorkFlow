"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3, Download } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { startOfMonth, endOfMonth } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exportMonthForCrm } from "@/lib/export/crm-export";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";

function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function StatisticsClient() {
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();
  const [month, setMonth] = useState(() => ymKey(new Date()));

  const stats = useLiveQuery(async () => {
    const [yearStr, monthStr] = month.split("-");
    const year = Number(yearStr);
    const monthIndex0 = Number(monthStr) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex0)) return null;

    const startIso = startOfMonth(new Date(year, monthIndex0, 1)).toISOString();
    const endIso = endOfMonth(new Date(year, monthIndex0, 1)).toISOString();

    const [interventions, clients] = await Promise.all([
      db.interventions.where("startAt").between(startIso, endIso, true, true).toArray(),
      db.clients.toArray()
    ]);
    const clientById = new Map(clients.map((c) => [c.id, c.name]));

    let totalMinutes = 0;
    let totalKm = 0;
    const byClient = new Map<string, { clientId: string; count: number; minutes: number; km: number }>();
    for (const i of interventions) {
      totalMinutes += i.durationMinutes ?? 0;
      totalKm += i.km ?? 0;
      const prev = byClient.get(i.clientId) ?? { clientId: i.clientId, count: 0, minutes: 0, km: 0 };
      byClient.set(i.clientId, {
        clientId: i.clientId,
        count: prev.count + 1,
        minutes: prev.minutes + (i.durationMinutes ?? 0),
        km: prev.km + (i.km ?? 0)
      });
    }

    const topClients = Array.from(byClient.values())
      .sort((a, b) => b.count - a.count || b.minutes - a.minutes)
      .slice(0, 6)
      .map((x) => ({
        ...x,
        name: clientById.get(x.clientId) ?? "Client"
      }));

    return {
      year,
      monthIndex0,
      interventionsCount: interventions.length,
      totalMinutes,
      totalKm,
      topClients
    };
  }, [month, liveEpoch]);

  const totalHours = useMemo(() => {
    if (!stats) return "—";
    return `${(stats.totalMinutes / 60).toFixed(1)} h`;
  }, [stats]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm font-medium">Month</div>
          <input
            type="month"
            className="h-11 rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                if (!stats) return;
                await exportMonthForCrm(stats.year, stats.monthIndex0);
                toast({ title: "Exported", description: "Monthly JSON + CSV downloaded." });
              } catch (e: any) {
                toast({
                  title: "Export failed",
                  description: e?.message ?? "Could not export",
                  variant: "destructive"
                });
              }
            }}
          >
            <Download className="h-4 w-4" />
            Export JSON + CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Interventions</CardTitle>
            <CardDescription className="text-2xl font-semibold text-foreground">
              {stats ? stats.interventionsCount : "—"}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Hours worked</CardTitle>
            <CardDescription className="text-2xl font-semibold text-foreground">
              {totalHours}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">KM traveled</CardTitle>
            <CardDescription className="text-2xl font-semibold text-foreground">
              {stats ? Math.round(stats.totalKm) : "—"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-base">Top clients</CardTitle>
          <CardDescription>By number of interventions (then hours).</CardDescription>
          <div className="mt-2 grid gap-2">
            {(stats?.topClients ?? []).map((c) => (
              <div key={c.clientId} className="flex items-center justify-between rounded-xl border bg-background px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{c.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {c.count} interventions • {(c.minutes / 60).toFixed(1)} h • {Math.round(c.km)} km
                  </div>
                </div>
                <div className="w-28">
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{
                        width: `${Math.min(100, Math.round((c.count / Math.max(1, stats?.topClients?.[0]?.count ?? 1)) * 100))}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}

            {(stats?.topClients ?? []).length === 0 ? (
              <div className="rounded-xl border bg-muted px-4 py-6 text-sm text-muted-foreground">
                No data for this month yet.
              </div>
            ) : null}
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}

