"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { AlarmClock, AlertTriangle, Timer } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DueCountdown } from "@/components/interventions/due-countdown";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import {
  formatElapsedHms,
  getTimerElapsedSeconds,
  normalizeTimerRunState
} from "@/lib/interventions/intervention-helpers";

function fmtShort(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function DashboardAttention() {
  const liveEpoch = useWorkflowLiveEpoch();
  const clients = useLiveQuery(async () => db.clients.toArray(), [liveEpoch]);
  const data = useLiveQuery(async () => {
    const all = await db.interventions.toArray();
    const now = Date.now();
    const week = now + 7 * 86400000;

    const overdue = all.filter(
      (i) => i.status !== "completed" && i.dueAt && new Date(i.dueAt).getTime() < now
    );
    const upcoming = all
      .filter(
        (i) =>
          i.status !== "completed" &&
          i.dueAt &&
          new Date(i.dueAt).getTime() >= now &&
          new Date(i.dueAt).getTime() <= week
      )
      .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())
      .slice(0, 8);

    const running = all.filter((i) => normalizeTimerRunState(i) === "running").slice(0, 8);

    return { overdue, upcoming, running };
  }, [liveEpoch]);

  const nameOf = (id: string) => clients?.find((c) => c.id === id)?.name ?? "Client";

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="rounded-2xl border-destructive/30 bg-destructive/5">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <CardTitle className="text-base">Overdue</CardTitle>
          </div>
          <CardDescription>Past “must complete by” and still open.</CardDescription>
        </CardHeader>
        <div className="space-y-2 px-5 pb-5">
          {(data?.overdue ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">Nothing overdue.</div>
          ) : (
            (data?.overdue ?? []).map((i) => (
              <Link
                key={i.id}
                href={`/interventions/${i.id}`}
                className="block rounded-xl border bg-background px-3 py-2.5 text-sm hover:bg-muted"
              >
                <div className="font-semibold">{nameOf(i.clientId)}</div>
                <div className="mt-0.5 text-xs text-destructive">
                  Due {i.dueAt ? fmtShort(i.dueAt) : "—"}
                </div>
              </Link>
            ))
          )}
        </div>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <AlarmClock className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Upcoming due</CardTitle>
          </div>
          <CardDescription>Next 7 days.</CardDescription>
        </CardHeader>
        <div className="space-y-2 px-5 pb-5">
          {(data?.upcoming ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No upcoming deadlines.</div>
          ) : (
            (data?.upcoming ?? []).map((i) => (
              <Link
                key={i.id}
                href={`/interventions/${i.id}`}
                className="block rounded-xl border bg-muted/40 px-3 py-2.5 text-sm hover:bg-muted"
              >
                <div className="font-semibold">{nameOf(i.clientId)}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{i.dueAt ? fmtShort(i.dueAt) : "—"}</span>
                  <DueCountdown intervention={i} />
                </div>
              </Link>
            ))
          )}
        </div>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Running timers</CardTitle>
          </div>
          <CardDescription>Work timers currently counting.</CardDescription>
        </CardHeader>
        <div className="space-y-2 px-5 pb-5">
          {(data?.running ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No active timers.</div>
          ) : (
            (data?.running ?? []).map((i) => (
              <Link
                key={i.id}
                href={`/interventions/${i.id}`}
                className="flex items-center justify-between gap-2 rounded-xl border bg-muted/40 px-3 py-2.5 text-sm hover:bg-muted"
              >
                <span className="min-w-0 truncate font-semibold">{nameOf(i.clientId)}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums">
                  {formatElapsedHms(getTimerElapsedSeconds(i))}
                </span>
              </Link>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
