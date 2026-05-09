"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startOfDay } from "@/lib/dates";
import { InterventionFormDialog } from "@/components/interventions/intervention-form-dialog";

type QuickFilter = "today" | "month" | "all";
type StatusFilter = "all" | "open" | "completed";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function InterventionsClient() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<QuickFilter>("today");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [open, setOpen] = useState(false);

  const clients = useLiveQuery(async () => {
    return await db.clients.orderBy("name").toArray();
  }, []);

  const interventions = useLiveQuery(async () => {
    const all = await db.interventions.orderBy("startAt").reverse().toArray();
    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const inRange = all.filter((it) => {
      const t = new Date(it.startAt).getTime();
      if (filter === "today") return t >= todayStart.getTime();
      if (filter === "month") return t >= monthStart.getTime();
      return true;
    });

    const withStatus =
      status === "all" ? inRange : inRange.filter((it) => (it.status ?? "open") === status);

    const query = q.trim().toLowerCase();
    if (!query) return withStatus;

    const clientById = new Map(clients?.map((c) => [c.id, c.name.toLowerCase()]));
    return withStatus.filter((it) => {
      const clientName = clientById.get(it.clientId) ?? "";
      return (
        it.type.toLowerCase().includes(query) ||
        (it.notes ?? "").toLowerCase().includes(query) ||
        clientName.includes(query)
      );
    });
  }, [q, filter, status, clients]);

  return (
    <div className="relative">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by client, type, notes…"
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(["today", "month", "all"] as const).map((k) => (
            <Button
              key={k}
              variant={filter === k ? "default" : "outline"}
              onClick={() => setFilter(k)}
            >
              {k === "today" ? "Today" : k === "month" ? "This month" : "All"}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(["all", "open", "completed"] as const).map((s) => (
          <Button
            key={s}
            variant={status === s ? "default" : "outline"}
            onClick={() => setStatus(s)}
          >
            {s === "all" ? "All statuses" : s === "open" ? "Open" : "Completed"}
          </Button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b bg-muted px-4 py-3 text-sm font-medium">
          <div>Intervention</div>
          <div className="text-right">KM</div>
        </div>

        <div className="divide-y">
          {(interventions ?? []).map((it) => {
            const clientName =
              clients?.find((c) => c.id === it.clientId)?.name ?? "Client";
            const duration =
              it.durationMinutes != null ? `${it.durationMinutes} min` : "—";
            return (
              <Link
                key={it.id}
                href={`/interventions/${it.id}`}
                className="grid grid-cols-[1fr_auto] gap-3 px-4 py-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">
                    {clientName}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="rounded-full border bg-background px-2 py-0.5">
                      {it.type}
                    </span>
                    <span>{formatTime(it.startAt)}</span>
                    <span>{duration}</span>
                  </div>
                  {it.notes ? (
                    <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {it.notes}
                    </div>
                  ) : null}
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  {it.km ?? "—"}
                </div>
              </Link>
            );
          })}

          {(interventions ?? []).length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No interventions yet.
            </div>
          ) : null}
        </div>
      </div>

      {/* Floating action button (tablet-friendly) */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-40">
        <Button
          className="pointer-events-auto shadow-lg"
          size="lg"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-5 w-5" />
          New Intervention
        </Button>
      </div>

      <InterventionFormDialog
        open={open}
        onOpenChange={setOpen}
        mode="new"
      />
    </div>
  );
}

