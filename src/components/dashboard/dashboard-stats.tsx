"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ClipboardList, Clock3, MapPin, MessagesSquare } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/workflow-db";
import { endOfDay, endOfMonth, startOfDay, startOfMonth } from "@/lib/dates";
import { IconBubble } from "@/components/ui/icon";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";

function minutesToHours(min: number) {
  return Math.round((min / 60) * 10) / 10;
}

export function DashboardStats() {
  const liveEpoch = useWorkflowLiveEpoch();
  const now = new Date();
  const todayStart = startOfDay(now).toISOString();
  const todayEnd = endOfDay(now).toISOString();
  const monthStart = startOfMonth(now).toISOString();
  const monthEnd = endOfMonth(now).toISOString();

  const interventionsToday = useLiveQuery(async () => {
    return await db.interventions
      .where("startAt")
      .between(todayStart, todayEnd, true, true)
      .count();
  }, [todayStart, todayEnd, liveEpoch]);

  const monthTotals = useLiveQuery(async () => {
    const items = await db.interventions
      .where("startAt")
      .between(monthStart, monthEnd, true, true)
      .toArray();

    const durationMinutes = items.reduce((acc, it) => acc + (it.durationMinutes ?? 0), 0);
    const km = items.reduce((acc, it) => acc + (it.km ?? 0), 0);
    return { durationMinutes, km };
  }, [monthStart, monthEnd, liveEpoch]);

  const pendingTickets = useLiveQuery(async () => {
    // Pending = open/pending. If reminderAt exists and is <= now, it’s due.
    const tickets = await db.tickets
      .where("status")
      .anyOf(["open", "pending"])
      .toArray();

    const nowIso = now.toISOString();
    const due = tickets.filter((t) => !t.reminderAt || t.reminderAt <= nowIso);
    return { due: due.length, total: tickets.length };
  }, [now.toDateString(), liveEpoch]);

  const cards = [
    {
      title: "Interventions (today)",
      icon: ClipboardList,
      value: interventionsToday ?? "—",
      hint: "Created locally, sync later"
    },
    {
      title: "Hours (this month)",
      icon: Clock3,
      value: monthTotals ? String(minutesToHours(monthTotals.durationMinutes)) : "—",
      hint: "Sum of durations"
    },
    {
      title: "KM (this month)",
      icon: MapPin,
      value: monthTotals ? String(Math.round(monthTotals.km)) : "—",
      hint: "Travel distance"
    },
    {
      title: "Pending CRM tickets",
      icon: MessagesSquare,
      value: pendingTickets ? String(pendingTickets.due) : "—",
      hint: pendingTickets ? `${pendingTickets.total} open/pending` : "Reminders due"
    }
  ] as const;

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.title} className="rounded-2xl">
          <CardHeader className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <CardDescription className="text-xs">{c.title}</CardDescription>
              <IconBubble icon={c.icon} />
            </div>
            <CardTitle className="text-4xl tracking-tight">{c.value}</CardTitle>
            <div className="text-xs text-muted-foreground">{c.hint}</div>
          </CardHeader>
        </Card>
      ))}
    </section>
  );
}

