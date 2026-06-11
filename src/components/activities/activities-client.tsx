"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlarmClock,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2
} from "lucide-react";
import {
  ACTIVITY_PRIORITIES,
  ACTIVITY_STATUSES,
  db,
  type Activity
} from "@/lib/db/workflow-db";
import {
  isActivityOverdue,
  getActivityReminderScheduledFireMs
} from "@/lib/activities/activity-reminders";
import { setActivityStatus } from "@/lib/activities/activity-mutations";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { performActivityCloudSyncDelete } from "@/lib/sync/cloud-delete";
import { CalendarExportButton } from "@/components/calendar/calendar-export-button";
import {
  activityToCalendarEvent,
  calendarFilename
} from "@/lib/calendar/calendar-events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { ActivityFormDialog } from "@/components/activities/activity-form-dialog";
import { ActivityPostponeDialog } from "@/components/activities/activity-postpone-dialog";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";

type StatusFilter = "all" | Activity["status"];
type PriorityFilter = "all" | Activity["priority"];

function priorityPill(p: Activity["priority"]) {
  if (p === "high") return "border-red-200 bg-red-50 text-red-800";
  if (p === "medium") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

function statusPill(s: Activity["status"]) {
  if (s === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (s === "in_progress") return "border-blue-200 bg-blue-50 text-blue-900";
  if (s === "postponed") return "border-purple-200 bg-purple-50 text-purple-900";
  return "border-slate-200 bg-slate-50 text-slate-800";
}

function formatDue(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function ActivitiesClient() {
  const t = useTranslations();
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [priority, setPriority] = useState<PriorityFilter>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [postponeTarget, setPostponeTarget] = useState<Activity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const activities = useLiveQuery(async () => {
    const all = await db.activities.orderBy("updatedAt").reverse().toArray();
    const now = Date.now();
    const qv = q.trim().toLowerCase();

    const filtered = all.filter((a) => {
      const sOk = status === "all" ? true : a.status === status;
      const pOk = priority === "all" ? true : a.priority === priority;
      const qOk =
        !qv ||
        a.title.toLowerCase().includes(qv) ||
        (a.description ?? "").toLowerCase().includes(qv) ||
        (a.category ?? "").toLowerCase().includes(qv);
      return sOk && pOk && qOk;
    });

    const rank = (a: Activity) => {
      if (a.status === "completed") return 3;
      if (isActivityOverdue(a, now)) return 0;
      if (a.dueAt) return 1;
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

  const counts = useMemo(() => {
    const list = activities ?? [];
    const now = Date.now();
    return {
      total: list.length,
      open: list.filter((a) => a.status !== "completed").length,
      overdue: list.filter((a) => isActivityOverdue(a, now)).length
    };
  }, [activities]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(a: Activity) {
    setEditing(a);
    setFormOpen(true);
  }

  async function toggleComplete(a: Activity) {
    const next = a.status === "completed" ? "open" : "completed";
    try {
      await setActivityStatus(a, next);
      toast({
        title: t("activities.toasts.updatedTitle"),
        description: t("activities.toasts.statusBody", { status: t(`activities.status.${next}`) })
      });
    } catch (e) {
      toast({
        title: t("activities.toasts.saveFailedTitle"),
        description: e instanceof Error ? e.message : t("common.unknownError"),
        variant: "destructive"
      });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await performActivityCloudSyncDelete({
        activityId: deleteTarget.id,
        supabase,
        userId: null
      });
      if (!res.ok) {
        toast({
          title: t("activities.toasts.deleteFailedTitle"),
          description: res.message,
          variant: "destructive"
        });
      } else {
        toast({ title: t("activities.toasts.deletedTitle") });
      }
      setDeleteTarget(null);
    } catch (e) {
      toast({
        title: t("activities.toasts.deleteFailedTitle"),
        description: e instanceof Error ? e.message : t("common.unknownError"),
        variant: "destructive"
      });
    } finally {
      setDeleting(false);
    }
  }

  const list = activities ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("activities.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Button size="lg" onClick={openCreate} className="shrink-0">
          <Plus className="h-5 w-5" />
          {t("activities.actions.new")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...ACTIVITY_STATUSES] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? "default" : "outline"}
            onClick={() => setStatus(s)}
          >
            {s === "all" ? t("activities.filters.statusAll") : t(`activities.status.${s}`)}
          </Button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-border sm:inline-block" aria-hidden />
        {(["all", ...ACTIVITY_PRIORITIES] as const).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={priority === p ? "default" : "outline"}
            onClick={() => setPriority(p)}
          >
            {p === "all" ? t("activities.filters.priorityAll") : t(`activities.priority.${p}`)}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:max-w-md">
        <div className="rounded-xl border bg-muted/40 p-2.5 sm:p-3">
          <div className="text-xs text-muted-foreground">{t("activities.summary.open")}</div>
          <div className="text-lg font-semibold tabular-nums sm:text-xl">{counts.open}</div>
        </div>
        <div className="rounded-xl border bg-muted/40 p-2.5 sm:p-3">
          <div className="text-xs text-muted-foreground">{t("activities.summary.overdue")}</div>
          <div className="text-lg font-semibold tabular-nums text-red-700 sm:text-xl">{counts.overdue}</div>
        </div>
        <div className="rounded-xl border bg-muted/40 p-2.5 sm:p-3">
          <div className="text-xs text-muted-foreground">{t("activities.summary.total")}</div>
          <div className="text-lg font-semibold tabular-nums sm:text-xl">{counts.total}</div>
        </div>
      </div>

      <div className="grid gap-2.5 lg:gap-3">
        {list.map((a) => {
          const overdue = isActivityOverdue(a, Date.now());
          const hasReminder = a.remindersEnabled && getActivityReminderScheduledFireMs(a) != null;
          const postponedCount = a.postponements?.length ?? 0;
          const calendarEvent = activityToCalendarEvent(a);
          const tags = (a.category ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          return (
            <div
              key={a.id}
              className="rounded-xl border p-3.5 transition-colors hover:bg-muted/40 sm:p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left focus-visible:outline-none"
                  onClick={() => openEdit(a)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`truncate text-base font-semibold ${
                        a.status === "completed" ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      {a.title}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${priorityPill(a.priority)}`}
                    >
                      {t(`activities.priority.${a.priority}`)}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${statusPill(a.status)}`}
                    >
                      {t(`activities.status.${a.status}`)}
                    </span>
                    {overdue ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800">
                        <AlarmClock className="h-3.5 w-3.5" />
                        {t("activities.overdue")}
                      </span>
                    ) : null}
                  </div>

                  {a.description ? (
                    <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {a.description}
                    </div>
                  ) : null}

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {a.dueAt ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {formatDue(a.dueAt)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {t("activities.noDue")}
                      </span>
                    )}
                    {hasReminder ? (
                      <span className="inline-flex items-center gap-1">
                        <Bell className="h-3.5 w-3.5" />
                        {t(`activities.reminderPresets.${a.reminderPreset ?? "2h"}`)}
                      </span>
                    ) : null}
                    {postponedCount > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <History className="h-3.5 w-3.5" />
                        {t("activities.postponedCount", { count: postponedCount })}
                      </span>
                    ) : null}
                  </div>

                  {tags.length ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          <Tag className="h-3 w-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>

              <div className="flex flex-wrap items-center gap-2 border-t pt-3 lg:max-w-md lg:shrink-0 lg:flex-col lg:items-stretch lg:border-t-0 lg:border-l lg:pl-4 lg:pt-0">
                <Button
                  type="button"
                  size="sm"
                  className="min-h-10 flex-1 sm:flex-none"
                  variant={a.status === "completed" ? "outline" : "default"}
                  onClick={() => toggleComplete(a)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {a.status === "completed"
                    ? t("activities.actions.reopen")
                    : t("activities.actions.complete")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="min-h-10 flex-1 sm:flex-none"
                  variant="outline"
                  onClick={() => setPostponeTarget(a)}
                >
                  <AlarmClock className="h-4 w-4" />
                  {t("activities.actions.postpone")}
                </Button>
                {calendarEvent ? (
                  <CalendarExportButton
                    event={calendarEvent}
                    filename={calendarFilename(a.title, a.id)}
                    triggerSize="sm"
                    className="min-h-10 flex-1 sm:flex-none"
                  />
                ) : null}
                <Button type="button" size="sm" className="min-h-10" variant="outline" onClick={() => openEdit(a)}>
                  <Pencil className="h-4 w-4" />
                  {t("common.edit")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="min-h-10"
                  variant="outline"
                  onClick={() => setDeleteTarget(a)}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("common.delete")}
                </Button>
              </div>
              </div>
            </div>
          );
        })}

        {list.length === 0 ? (
          <div className="rounded-2xl border px-4 py-12 text-center text-sm text-muted-foreground">
            {t("activities.empty")}
          </div>
        ) : null}
      </div>

      <ActivityFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        activity={editing}
      />

      <ActivityPostponeDialog
        open={Boolean(postponeTarget)}
        onOpenChange={(o) => {
          if (!o) setPostponeTarget(null);
        }}
        activity={postponeTarget}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("activities.deleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("activities.deleteDialog.body", { title: deleteTarget?.title ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
              className="gap-2"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {deleting ? t("common.deleting") : t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
