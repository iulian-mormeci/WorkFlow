"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertCircle, Plus, Search } from "lucide-react";
import { db, type Ticket } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";

type Status = "all" | Ticket["status"];
type Priority = Ticket["priority"] | "all";

function toLocalDateInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function priorityPill(p: Ticket["priority"]) {
  if (p === "high") return "border-red-200 bg-red-50 text-red-800";
  if (p === "medium") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

export function CrmTicketsClient() {
  const t = useTranslations();
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [priority, setPriority] = useState<Priority>("all");
  const [open, setOpen] = useState(false);

  const tickets = useLiveQuery(async () => {
    const all = await db.tickets.orderBy("updatedAt").reverse().toArray();
    const nowIso = new Date().toISOString();

    const filtered = all.filter((t) => {
      const sOk = status === "all" ? true : t.status === status;
      const pOk = priority === "all" ? true : t.priority === priority;
      const qv = q.trim().toLowerCase();
      const qOk =
        !qv ||
        t.title.toLowerCase().includes(qv) ||
        (t.description ?? "").toLowerCase().includes(qv);
      return sOk && pOk && qOk;
    });

    // Sort due reminders to top
    filtered.sort((a, b) => {
      const aDue = (a.reminderAt ?? a.dueAt ?? "9999") <= nowIso ? 0 : 1;
      const bDue = (b.reminderAt ?? b.dueAt ?? "9999") <= nowIso ? 0 : 1;
      if (aDue !== bDue) return aDue - bDue;
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    });

    return filtered;
  }, [q, status, priority, liveEpoch]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium" as Ticket["priority"],
    dueDate: toLocalDateInputValue(new Date())
  });

  const canSave = useMemo(() => form.title.trim().length > 2, [form.title]);

  async function createTicket() {
    const nowIso = new Date().toISOString();
    const dueAt = form.dueDate ? new Date(form.dueDate).toISOString() : undefined;
    const reminderAt = dueAt; // simple first version: reminder == due date

    try {
      await db.tickets.add({
        id: crypto.randomUUID(),
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        status: "open",
        dueAt,
        reminderAt,
        createdAt: nowIso,
        updatedAt: nowIso
      });
      toast({ title: t("tickets.toasts.createdTitle"), description: t("tickets.toasts.savedLocally") });
      setOpen(false);
      setForm({
        title: "",
        description: "",
        priority: "medium",
        dueDate: toLocalDateInputValue(new Date())
      });
    } catch (e: any) {
      toast({
        title: t("tickets.toasts.createFailedTitle"),
        description: e?.message ?? t("common.unknownError"),
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
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "open", "pending", "closed"] as const).map((s) => (
            <Button
              key={s}
              variant={status === s ? "default" : "outline"}
              onClick={() => setStatus(s)}
            >
              {s === "all" ? t("tickets.filters.statusAll") : t(`tickets.status.${s}`)}
            </Button>
          ))}
          {(["all", "low", "medium", "high"] as const).map((p) => (
            <Button
              key={p}
              variant={priority === p ? "default" : "outline"}
              onClick={() => setPriority(p)}
            >
              {p === "all" ? t("tickets.filters.priorityAll") : t(`tickets.priority.${p}`)}
            </Button>
          ))}
          <Button size="lg" onClick={() => setOpen(true)}>
            <Plus className="h-5 w-5" />
            {t("tickets.actions.new")}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b bg-muted px-4 py-3 text-sm font-medium">
          <div>{t("tickets.table.ticket")}</div>
          <div className="text-right">{t("tickets.table.status")}</div>
        </div>
        <div className="divide-y">
          {(tickets ?? []).map((t) => {
            const nowIso = new Date().toISOString();
            const due = (t.reminderAt ?? t.dueAt) && (t.reminderAt ?? t.dueAt)! <= nowIso;
            return (
              <button
                key={t.id}
                type="button"
                className="w-full px-4 py-4 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                onClick={async () => {
                  const nextStatus =
                    t.status === "open" ? "pending" : t.status === "pending" ? "closed" : "open";
                  await db.tickets.update(t.id, { status: nextStatus, updatedAt: new Date().toISOString() });
                  toast({
                    title: t("tickets.toasts.updatedTitle"),
                    description: t("tickets.toasts.updatedBody", { status: t(`tickets.status.${nextStatus}`) })
                  });
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-base font-semibold">{t.title}</div>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${priorityPill(t.priority)}`}>
                        {t.priority}
                      </span>
                      {due ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {t("tickets.reminderDue")}
                        </span>
                      ) : null}
                    </div>
                    {t.description ? (
                      <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {t.description}
                      </div>
                    ) : null}
                    {t.dueAt ? (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {t("tickets.duePrefix")} {new Date(t.dueAt).toLocaleDateString()}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    {t(`tickets.status.${t.status}`)}
                  </div>
                </div>
              </button>
            );
          })}

          {(tickets ?? []).length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t("tickets.empty")}
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tickets.dialog.title")}</DialogTitle>
            <DialogDescription>{t("tickets.dialog.subtitle")}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-3">
            <div className="grid gap-2">
              <Label>{t("tickets.fields.title")}</Label>
              <Input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{t("tickets.fields.description")}</Label>
              <Textarea value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("tickets.fields.priority")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["low", "medium", "high"] as const).map((p) => (
                    <Button
                      key={p}
                      variant={form.priority === p ? "default" : "outline"}
                      onClick={() => setForm((s) => ({ ...s, priority: p }))}
                      type="button"
                    >
                      {t(`tickets.priority.${p}`)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <Label>{t("tickets.fields.dueDate")}</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm((s) => ({ ...s, dueDate: e.target.value }))} />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} type="button">
                {t("common.cancel")}
              </Button>
              <Button disabled={!canSave} onClick={createTicket} type="button">
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

