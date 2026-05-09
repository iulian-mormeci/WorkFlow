"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/workflow-db";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { InterventionStatusBadge } from "@/components/interventions/intervention-status-badge";

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function DashboardRecent() {
  const clients = useLiveQuery(async () => db.clients.toArray(), []);
  const recent = useLiveQuery(async () => {
    return await db.interventions.orderBy("startAt").reverse().limit(6).toArray();
  }, []);

  const clientById = new Map(clients?.map((c) => [c.id, c.name]) ?? []);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">Recent interventions</CardTitle>
        <CardDescription>Tap an item to edit or add details.</CardDescription>
      </CardHeader>

      <div className="px-2 pb-2">
        <div className="divide-y overflow-hidden rounded-xl border">
          {(recent ?? []).map((it) => (
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
                    {fmt(it.startAt)} • {it.type}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <InterventionStatusBadge intervention={it} />
                  <div className="text-xs text-muted-foreground">
                    {it.durationMinutes != null ? `${it.durationMinutes}m` : "—"}
                  </div>
                </div>
              </div>
            </Link>
          ))}

          {(recent ?? []).length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No interventions yet.
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

