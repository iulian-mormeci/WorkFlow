"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Target } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DueCountdown } from "@/components/interventions/due-countdown";
import { InterventionStatusBadge } from "@/components/interventions/intervention-status-badge";
import { endOfDay, startOfDay } from "@/lib/dates";
import { useSecondTicker } from "@/hooks/use-second-ticker";
import {
  formatElapsedHms,
  getTimerElapsedSeconds,
  isInterventionCompleted,
  normalizeTimerRunState
} from "@/lib/interventions/intervention-helpers";
import { IconBubble } from "@/components/ui/icon";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function TodaysFocus() {
  const liveEpoch = useWorkflowLiveEpoch();
  const tick = useSecondTicker(1000);
  void tick;
  const now = new Date();
  const todayStart = startOfDay(now).toISOString();
  const todayEnd = endOfDay(now).toISOString();

  const clients = useLiveQuery(async () => db.clients.toArray(), [liveEpoch]);
  const focus = useLiveQuery(async () => {
    const list = await db.interventions
      .where("startAt")
      .between(todayStart, todayEnd, true, true)
      .toArray();
    return list.filter((i) => !isInterventionCompleted(i))
      .sort(
        (a, b) =>
          (normalizeTimerRunState(b) === "running" ? 1 : 0) -
            (normalizeTimerRunState(a) === "running" ? 1 : 0) || b.startAt.localeCompare(a.startAt)
      )
      .slice(0, 6);
  }, [todayStart, todayEnd, liveEpoch]);

  const clientById = new Map(clients?.map((c) => [c.id, c.name]) ?? []);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Today’s Focus</CardTitle>
            <CardDescription>Started or open interventions to close today.</CardDescription>
          </div>
          <IconBubble icon={Target} />
        </div>
      </CardHeader>

      <div className="px-2 pb-2">
        <div className="divide-y overflow-hidden rounded-xl border">
          {(focus ?? []).map((it) => (
            <Link
              key={it.id}
              href={`/interventions/${it.id}`}
              className="block px-4 py-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {clientById.get(it.clientId) ?? "Client"}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {fmtTime(it.startAt)} •{" "}
                    {(it.workCategory ?? "intervention") === "activity" ? "Activity · " : ""}
                    {it.type}
                    {it.dueAt && !isInterventionCompleted(it) ? (
                      <>
                        {" "}
                        · <DueCountdown intervention={it} />
                      </>
                    ) : null}
                    {normalizeTimerRunState(it) === "running" ? (
                      <>
                        {" "}
                        · <span className="font-mono">{formatElapsedHms(getTimerElapsedSeconds(it))}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <InterventionStatusBadge intervention={it} />
              </div>
            </Link>
          ))}

          {(focus ?? []).length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nothing pending for today.
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

