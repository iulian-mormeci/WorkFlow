"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { startOfDay } from "@/lib/dates";
import { InterventionFormDialog } from "@/components/interventions/intervention-form-dialog";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { performInterventionCloudSyncDelete } from "@/lib/sync/cloud-delete";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<QuickFilter>("today");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [listDeleting, setListDeleting] = useState(false);

  const clients = useLiveQuery(async () => {
    return await db.clients.orderBy("name").toArray();
  }, [liveEpoch]);

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
  }, [q, filter, status, clients, liveEpoch]);

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
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b bg-muted px-4 py-3 text-sm font-medium">
          <div>Intervention</div>
          <div className="text-right">KM</div>
          <div className="w-11 shrink-0" aria-hidden />
        </div>

        <div className="divide-y">
          {(interventions ?? []).map((it) => {
            const clientName =
              clients?.find((c) => c.id === it.clientId)?.name ?? "Client";
            const duration =
              it.durationMinutes != null ? `${it.durationMinutes} min` : "—";
            return (
              <div
                key={it.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-4 hover:bg-muted/60"
              >
                <Link
                  href={`/interventions/${it.id}`}
                  className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <div className="truncate text-base font-semibold">{clientName}</div>
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
                </Link>
                <div className="text-right text-sm text-muted-foreground">
                  {it.km ?? "—"}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive hover:text-destructive"
                  aria-label={`Delete intervention for ${clientName}`}
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

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => !listDeleting && !v && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete intervention?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `Remove “${deleteTarget.label}” from this device and from the cloud when you are online, including linked documents, photos, voice notes, and stock movements for this visit. Tickets are only unlinked. You cannot undo this.`
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
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
              disabled={listDeleting}
              onClick={async () => {
                if (!deleteTarget) return;
                setListDeleting(true);
                try {
                  const supabase = createSupabaseBrowserClient();
                  const {
                    data: { user }
                  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
                  const res = await performInterventionCloudSyncDelete({
                    interventionId: deleteTarget.id,
                    supabase: supabase ?? null,
                    userId: user?.id ?? null
                  });
                  if (!res.ok) {
                    toast({
                      title: "Could not delete in the cloud",
                      description: res.message,
                      variant: "destructive"
                    });
                    return;
                  }
                  toast({
                    title: "Intervention deleted",
                    description: navigator.onLine
                      ? "Removed from this device and from your cloud account."
                      : "Removed from this device; cloud removal is queued for the next online sync."
                  });
                  scheduleWorkflowSync();
                  setDeleteTarget(null);
                } catch (e: unknown) {
                  toast({
                    title: "Could not delete",
                    description: e instanceof Error ? e.message : String(e),
                    variant: "destructive"
                  });
                } finally {
                  setListDeleting(false);
                }
              }}
            >
              {listDeleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

