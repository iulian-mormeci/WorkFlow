"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Loader2, Plus, Search, Timer, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { db } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { startOfDay } from "@/lib/dates";
import { DueCountdown } from "@/components/interventions/due-countdown";
import { InterventionFormDialog } from "@/components/interventions/intervention-form-dialog";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useSecondTicker } from "@/hooks/use-second-ticker";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { performInterventionCloudSyncDelete } from "@/lib/sync/cloud-delete";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import {
  formatElapsedHms,
  getTimerElapsedSeconds,
  isInterventionCompleted,
  isInterventionOverdue,
  normalizeTimerRunState
} from "@/lib/interventions/intervention-helpers";

type ListScope = "all" | "today" | "overdue" | "interventions" | "activities";
type StatusFilter = "all" | "open" | "completed";

function formatTime(iso?: string) {
  if (!iso) return null;
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
  const t = useTranslations();
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();
  const tick = useSecondTicker(1000);
  void tick;
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<ListScope>("today");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [open, setOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<{
    formPreset?: "client" | "office";
    workCategory?: "intervention" | "activity";
    isOfficeActivity?: boolean;
  }>();
  const searchParams = useSearchParams();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [listDeleting, setListDeleting] = useState(false);
  /** Null until mount so “today” / overdue filters match SSR + first client paint. */
  const [clock, setClock] = useState<number | null>(null);

  useEffect(() => {
    setClock(Date.now());
  }, []);

  const clients = useLiveQuery(async () => {
    return await db.clients.orderBy("name").toArray();
  }, [liveEpoch]);

  const interventions = useLiveQuery(async () => {
    const all = await db.interventions.orderBy("startAt").reverse().toArray();

    let list = all;
    if (clock != null) {
      const now = clock;
      const todayStart = startOfDay(new Date(now)).getTime();
      if (scope === "today") {
        // Treat rows without a start time as “unscheduled” tasks: keep them visible in Today.
        list = list.filter((it) => {
          if (!it.startAt) return true;
          return new Date(it.startAt).getTime() >= todayStart;
        });
      } else if (scope === "overdue") {
        list = list.filter(
          (it) =>
            !isInterventionCompleted(it) &&
            it.dueAt &&
            new Date(it.dueAt).getTime() < now
        );
      }
    }
    if (scope === "interventions") {
      list = list.filter((it) => (it.workCategory ?? "intervention") === "intervention");
    } else if (scope === "activities") {
      list = list.filter((it) => (it.workCategory ?? "intervention") === "activity");
    }

    const withStatus =
      status === "all"
        ? list
        : status === "completed"
          ? list.filter((it) => isInterventionCompleted(it))
          : list.filter((it) => !isInterventionCompleted(it));

    const query = q.trim().toLowerCase();
    if (!query) return withStatus;

    const clientById = new Map(clients?.map((c) => [c.id, c.name.toLowerCase()]));
    return withStatus.filter((it) => {
      const clientName = clientById.get(it.clientId) ?? "";
      const cat = (it.workCategory ?? "intervention").toLowerCase();
      const dueBit = (it.dueAt ?? "").toLowerCase();
      return (
        it.type.toLowerCase().includes(query) ||
        (it.notes ?? "").toLowerCase().includes(query) ||
        clientName.includes(query) ||
        cat.includes(query) ||
        dueBit.includes(query)
      );
    });
  }, [q, scope, status, clients, liveEpoch, clock]);

  useEffect(() => {
    if (searchParams?.get("new") === "1") {
      setFormInitial({ formPreset: "client", workCategory: "intervention" });
      setOpen(true);
    }
  }, [searchParams]);

  function openClientIntervention() {
    setFormInitial({ formPreset: "client", workCategory: "intervention", isOfficeActivity: false });
    setOpen(true);
  }

  function openOfficeActivity() {
    setFormInitial({ formPreset: "office", workCategory: "activity", isOfficeActivity: true });
    setOpen(true);
  }

  return (
    <div className="relative">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          size="lg"
          className="min-h-12 touch-manipulation justify-start gap-2 px-4"
          onClick={openClientIntervention}
        >
          <Plus className="h-5 w-5 shrink-0" />
          {t("work.actions.newClientIntervention")}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="min-h-12 touch-manipulation justify-start gap-2 px-4"
          onClick={openOfficeActivity}
        >
          <Plus className="h-5 w-5 shrink-0" />
          {t("work.actions.newOfficeActivity")}
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("interventions.list.searchPlaceholder")}
            className="min-h-12 pl-9 text-base"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ["all", t("interventions.list.scopes.all")],
            ["today", t("interventions.list.scopes.today")],
            ["overdue", t("interventions.list.scopes.overdue")],
            ["interventions", t("interventions.list.scopes.interventions")],
            ["activities", t("interventions.list.scopes.activities")]
          ] as const
        ).map(([k, label]) => (
          <Button
            key={k}
            variant={scope === k ? "default" : "outline"}
            className="min-h-11 touch-manipulation"
            onClick={() => setScope(k)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {(["all", "open", "completed"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? "default" : "outline"}
            className="min-h-10 touch-manipulation"
            onClick={() => setStatus(s)}
          >
            {s === "all"
              ? t("interventions.list.statusFilters.all")
              : s === "open"
                ? t("interventions.list.statusFilters.open")
                : t("interventions.list.statusFilters.completed")}
          </Button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b bg-muted px-4 py-3 text-sm font-medium sm:grid-cols-[1fr_auto_auto]">
          <div>{t("interventions.list.table.title")}</div>
          <div className="text-right">{t("common.km")}</div>
          <div className="hidden w-11 shrink-0 sm:block" aria-hidden />
        </div>

        <div className="divide-y">
          {(interventions ?? []).map((it) => {
            const clientName =
              clients?.find((c) => c.id === it.clientId)?.name ?? t("common.client");
            const duration =
              it.durationMinutes != null
                ? t("common.minutesShort", { minutes: it.durationMinutes })
                : "—";
            const overdue = clock != null && isInterventionOverdue(it, clock);
            const tState = normalizeTimerRunState(it);
            const timerNow =
              clock != null
                ? Date.now()
                : it.timerStartedAt
                  ? new Date(it.timerStartedAt).getTime()
                  : 0;
            return (
              <div
                key={it.id}
                className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-4 hover:bg-muted/60 sm:grid-cols-[1fr_auto_auto]"
              >
                <Link
                  href={`/interventions/${it.id}`}
                  className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <div className="truncate text-base font-semibold">{clientName}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <Badge
                      className={
                        (it.workCategory ?? "intervention") === "activity"
                          ? "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-200"
                          : "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100"
                      }
                    >
                      {(it.workCategory ?? "intervention") === "activity"
                        ? t("work.badgeOffice")
                        : t("work.badgeClient")}
                    </Badge>
                    {overdue ? (
                      <span className="rounded-full bg-destructive/15 px-2 py-0.5 font-medium text-destructive">
                        {t("common.overdue")}
                      </span>
                    ) : null}
                    {tState === "running" ? (
                      <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 font-mono text-[11px]">
                        <Timer className="h-3 w-3" />
                        {formatElapsedHms(getTimerElapsedSeconds(it, timerNow))}
                      </span>
                    ) : null}
                    <span className="rounded-full border bg-background px-2 py-0.5">{it.type}</span>
                    <span suppressHydrationWarning>
                      {formatTime(it.startAt) ?? t("common.noDate")}
                    </span>
                    <span>{duration}</span>
                    {it.dueAt && !isInterventionCompleted(it) ? (
                      <span className={overdue ? "text-destructive" : ""}>
                        <DueCountdown intervention={it} />
                      </span>
                    ) : null}
                  </div>
                  {it.notes ? (
                    <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {it.notes}
                    </div>
                  ) : null}
                </Link>
                <div className="text-right text-sm text-muted-foreground">
                  {it.km ?? "—"}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="hidden shrink-0 text-destructive hover:text-destructive sm:inline-flex"
                  aria-label={t("interventions.list.deleteAria", { clientName })}
                  onClick={(e) => {
                    e.preventDefault();
                    setDeleteTarget({ id: it.id, label: clientName });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}

          {(interventions ?? []).length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t("interventions.list.empty")}
            </div>
          ) : null}
        </div>
      </div>

      <InterventionFormDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setFormInitial(undefined);
        }}
        mode="new"
        initial={formInitial}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => !listDeleting && !v && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("interventions.deleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? t("interventions.deleteDialog.body", { label: deleteTarget.label })
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={listDeleting}
              onClick={() => setDeleteTarget(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={listDeleting}
              className="gap-2"
              onClick={async () => {
                if (!deleteTarget) return;
                setListDeleting(true);
                try {
                  const supabase = createSupabaseBrowserClient();
                  const session =
                    (await supabase?.auth.getSession())?.data.session ?? null;
                  const res = await performInterventionCloudSyncDelete({
                    interventionId: deleteTarget.id,
                    supabase: supabase ?? null,
                    userId: session?.user?.id ?? null
                  });
                  if (!res.ok) {
                    toast({
                      title: t("interventions.toasts.deleteCloudFailedTitle"),
                      description: res.message,
                      variant: "destructive"
                    });
                    return;
                  }
                  toast({
                    title: t("interventions.toasts.deletedTitle"),
                    description:
                      res.mode === "queued"
                        ? t("interventions.toasts.deletedQueuedBody")
                        : t("interventions.toasts.deletedNowBody")
                  });
                  scheduleWorkflowSync();
                  setDeleteTarget(null);
                } catch (e: unknown) {
                  toast({
                    title: t("interventions.toasts.deleteFailedTitle"),
                    description: e instanceof Error ? e.message : String(e),
                    variant: "destructive"
                  });
                } finally {
                  setListDeleting(false);
                }
              }}
            >
              {listDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {listDeleting ? t("common.deleting") : t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
