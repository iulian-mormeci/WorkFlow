"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlarmClock, Bell, CalendarClock, Link2, Pencil, Plus, Search } from "lucide-react";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  db,
  type Ticket
} from "@/lib/db/workflow-db";
import {
  getTicketReminderScheduledFireMs,
  isTicketOverdue
} from "@/lib/tickets/ticket-reminders";
import { nextTicketStatus, setTicketStatus } from "@/lib/tickets/ticket-mutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TicketFormDialog } from "@/components/tickets/ticket-form-dialog";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";

type StatusFilter = "all" | Ticket["status"];
type PriorityFilter = "all" | Ticket["priority"];

function priorityPill(p: Ticket["priority"]) {
  if (p === "high") return "border-red-200 bg-red-50 text-red-800";
  if (p === "medium") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

function statusPill(s: Ticket["status"]) {
  if (s === "closed") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (s === "pending") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-800";
}

function formatDue(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function CrmTicketsClient() {
  const t = useTranslations();
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [priority, setPriority] = useState<PriorityFilter>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Ticket | null>(null);

  const tickets = useLiveQuery(async () => {
    const all = await db.tickets.orderBy("updatedAt").reverse().toArray();
    const now = Date.now();
    const qv = q.trim().toLowerCase();

    const filtered = all.filter((tk) => {
      const sOk = status === "all" ? true : tk.status === status;
      const pOk = priority === "all" ? true : tk.priority === priority;
      const qOk =
        !qv ||
        tk.title.toLowerCase().includes(qv) ||
        (tk.description ?? "").toLowerCase().includes(qv);
      return sOk && pOk && qOk;
    });

    const rank = (tk: Ticket) => {
      if (tk.status === "closed") return 3;
      if (isTicketOverdue(tk, now)) return 0;
      if (tk.dueAt) return 1;
      return 2;
    };

    filtered.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt.localeCompare(b.dueAt);
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    });

    return filtered;
  }, [q, status, priority, liveEpoch]);

  const list = tickets ?? [];

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(tk: Ticket) {
    setEditing(tk);
    setFormOpen(true);
  }

  async function cycleStatus(tk: Ticket) {
    const next = nextTicketStatus(tk.status);
    try {
      await setTicketStatus(tk, next);
      toast({
        title: t("tickets.toasts.updatedTitle"),
        description: t("tickets.toasts.updatedBody", { status: t(`tickets.status.${next}`) })
      });
    } catch (e) {
      toast({
        title: t("tickets.toasts.saveFailedTitle"),
        description: e instanceof Error ? e.message : t("common.unknownError"),
        variant: "destructive"
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("tickets.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Button size="lg" onClick={openCreate} className="shrink-0">
          <Plus className="h-5 w-5" />
          {t("tickets.actions.new")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...TICKET_STATUSES] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? "default" : "outline"}
            onClick={() => setStatus(s)}
          >
            {s === "all" ? t("tickets.filters.statusAll") : t(`tickets.status.${s}`)}
          </Button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-border sm:inline-block" aria-hidden />
        {(["all", ...TICKET_PRIORITIES] as const).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={priority === p ? "default" : "outline"}
            onClick={() => setPriority(p)}
          >
            {p === "all" ? t("tickets.filters.priorityAll") : t(`tickets.priority.${p}`)}
          </Button>
        ))}
      </div>

      <div className="grid gap-3">
        {list.map((tk) => {
          const overdue = isTicketOverdue(tk, Date.now());
          const hasReminder =
            tk.remindersEnabled && getTicketReminderScheduledFireMs(tk) != null;
          return (
            <div key={tk.id} className="rounded-2xl border p-4 transition-colors hover:bg-muted/40">
              <div className="flex items-start justify-between gap-3">
                {/* Fast action: tap to cycle status (open → pending → completed). */}
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left focus-visible:outline-none"
                  onClick={() => cycleStatus(tk)}
                  aria-label={t("tickets.actions.cycleStatus")}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`truncate text-base font-semibold ${
                        tk.status === "closed" ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      {tk.title}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${priorityPill(tk.priority)}`}
                    >
                      {t(`tickets.priority.${tk.priority}`)}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${statusPill(tk.status)}`}
                    >
                      {t(`tickets.status.${tk.status}`)}
                    </span>
                    {overdue ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800">
                        <AlarmClock className="h-3.5 w-3.5" />
                        {t("tickets.overdue")}
                      </span>
                    ) : null}
                  </div>

                  {tk.description ? (
                    <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {tk.description}
                    </div>
                  ) : null}

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {tk.dueAt ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {formatDue(tk.dueAt)}
                      </span>
                    ) : null}
                    {hasReminder ? (
                      <span className="inline-flex items-center gap-1">
                        <Bell className="h-3.5 w-3.5" />
                        {t(`tickets.reminderPresets.${tk.reminderPreset ?? "2h"}`)}
                      </span>
                    ) : null}
                    {tk.interventionId ? (
                      <span className="inline-flex items-center gap-1">
                        <Link2 className="h-3.5 w-3.5" />
                        {t("tickets.linkedBadge")}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {t("tickets.tapToCycleHint")}
                  </div>
                </button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => openEdit(tk)}
                >
                  <Pencil className="h-4 w-4" />
                  {t("common.edit")}
                </Button>
              </div>
            </div>
          );
        })}

        {list.length === 0 ? (
          <div className="rounded-2xl border px-4 py-12 text-center text-sm text-muted-foreground">
            {t("tickets.empty")}
          </div>
        ) : null}
      </div>

      <TicketFormDialog open={formOpen} onOpenChange={setFormOpen} ticket={editing} />
    </div>
  );
}
