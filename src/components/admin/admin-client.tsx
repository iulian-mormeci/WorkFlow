"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import {
  CheckCircle,
  XCircle,
  Users,
  ClipboardList,
  BarChart3,
  ShieldCheck,
  ShieldOff,
  RefreshCw,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── types ────────────────────────────────────────────────────── */

type AdminUser = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  role: string | null;
};

type PendingProcedure = {
  id: string;
  title: string;
  category: string;
  brand: string | null;
  model: string | null;
  content: string | null;
  tags: string[] | null;
  created_by: string;
  created_at: string;
};

type AdminStats = {
  totalUsers: number;
  approvedProcs: number;
  pendingProcs: number;
  rejectedProcs: number;
};

type TabId = "procedures" | "users" | "stats";

/* ─── component ────────────────────────────────────────────────── */

export function AdminClient() {
  const t = useTranslations();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [tab, setTab] = useState<TabId>("procedures");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingProcedure[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [rejectDialogProc, setRejectDialogProc] = useState<PendingProcedure | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  /* ─── loaders ─────────────────────────────────────────────────── */

  const loadUsers = useCallback(async () => {
    if (!supabase) return;
    setUsersLoading(true);
    setUsersError(null);
    const { data, error } = await supabase.rpc("workflow_admin_list_users");
    if (error) setUsersError(error.message);
    else setUsers((data as AdminUser[]) ?? []);
    setUsersLoading(false);
  }, [supabase]);

  const loadPending = useCallback(async () => {
    if (!supabase) return;
    setPendingLoading(true);
    setPendingError(null);
    const { data, error } = await supabase
      .from("wf_global_procedures")
      .select("id, title, category, brand, model, content, tags, created_by, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) setPendingError(error.message);
    else setPending((data as PendingProcedure[]) ?? []);
    setPendingLoading(false);
  }, [supabase]);

  const loadStats = useCallback(async () => {
    if (!supabase) return;
    setStatsLoading(true);
    const { data } = await supabase.rpc("workflow_admin_stats");
    if (data) setStats(data as AdminStats);
    setStatsLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadUsers();
    void loadPending();
    void loadStats();
  }, [loadUsers, loadPending, loadStats]);

  // Realtime: watch for new pending procedures so the badge and list update automatically.
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("admin-pending-watch")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wf_global_procedures",
          filter: "status=eq.pending"
        },
        () => {
          void loadPending();
          void loadStats();
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, loadPending, loadStats]);

  /* ─── actions ─────────────────────────────────────────────────── */

  async function handleSetRole(targetId: string, newRole: string) {
    if (!supabase || !user) return;
    setActionLoading(true);
    const { error } = await supabase.rpc("workflow_admin_set_user_role", {
      p_target_user_id: targetId,
      p_new_role: newRole
    });
    if (error) {
      toast({ title: t("admin.users.roleUpdateFailed"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("admin.users.roleUpdated") });
      await loadUsers();
    }
    setActionLoading(false);
  }

  async function handleApprove(proc: PendingProcedure) {
    if (!supabase) return;
    setActionLoading(true);
    const { error } = await supabase
      .from("wf_global_procedures")
      .update({
        status: "approved",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", proc.id);
    if (error) {
      toast({ title: t("admin.procedures.approveFailed"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("admin.procedures.approveSuccess") });
      await Promise.all([loadPending(), loadStats()]);
    }
    setActionLoading(false);
  }

  async function handleRejectConfirm() {
    if (!supabase || !rejectDialogProc) return;
    setActionLoading(true);
    const { error } = await supabase
      .from("wf_global_procedures")
      .update({
        status: "rejected",
        rejection_reason: rejectReason.trim() || null,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", rejectDialogProc.id);
    if (error) {
      toast({ title: t("admin.procedures.rejectFailed"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("admin.procedures.rejectSuccess") });
      setRejectDialogProc(null);
      setRejectReason("");
      await Promise.all([loadPending(), loadStats()]);
    }
    setActionLoading(false);
  }

  function closeRejectDialog() {
    if (actionLoading) return;
    setRejectDialogProc(null);
    setRejectReason("");
  }

  /* ─── render ─────────────────────────────────────────────────── */

  const TABS: { id: TabId; icon: React.ElementType; label: string }[] = [
    { id: "procedures", icon: ClipboardList, label: t("admin.tabs.procedures") },
    { id: "users",      icon: Users,          label: t("admin.tabs.users") },
    { id: "stats",      icon: BarChart3,       label: t("admin.tabs.stats") }
  ];

  return (
    <div className="space-y-4">
      {/* Tab strip */}
      <div className="flex gap-1 rounded-xl border bg-muted/30 p-1">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
              tab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
            {id === "procedures" && pending.length > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                {pending.length > 99 ? "99+" : pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Pending procedures tab ─────────────────────────── */}
      {tab === "procedures" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {t("admin.procedures.title")}
              {pending.length > 0 && (
                <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  {pending.length}
                </span>
              )}
            </h2>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8"
              onClick={loadPending}
              disabled={pendingLoading}
              aria-label="Aggiorna"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", pendingLoading && "animate-spin")} />
            </Button>
          </div>

          {pendingError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <p className="font-medium">{t("admin.procedures.loadFailed")}</p>
              <p className="mt-1 font-mono text-xs opacity-80">{pendingError}</p>
            </div>
          )}

          {pendingLoading && pending.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {pending.map((proc) => (
            <div key={proc.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-snug">{proc.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="rounded-full border bg-background px-2 py-0.5 capitalize">
                        {proc.category}
                      </span>
                      {proc.brand && <span>{proc.brand}</span>}
                      {proc.model && <span>· {proc.model}</span>}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t("admin.procedures.submittedAt")}:{" "}
                    {new Date(proc.created_at).toLocaleDateString()}
                  </span>
                </div>

                {proc.content && (
                  <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {proc.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}
                  </p>
                )}

                {proc.tags && proc.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {proc.tags.slice(0, 6).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 border-destructive/30 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
                    disabled={actionLoading}
                    onClick={() => { setRejectDialogProc(proc); setRejectReason(""); }}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {t("admin.procedures.reject")}
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    disabled={actionLoading}
                    onClick={() => handleApprove(proc)}
                  >
                    {actionLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5" />
                    )}
                    {t("admin.procedures.approve")}
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {!pendingLoading && pending.length === 0 && !pendingError && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center">
              <CheckCircle className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{t("admin.procedures.noPending")}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Users tab ─────────────────────────────────────── */}
      {tab === "users" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {t("admin.users.title")}
              {users.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({users.length})
                </span>
              )}
            </h2>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8"
              onClick={loadUsers}
              disabled={usersLoading}
              aria-label="Aggiorna"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", usersLoading && "animate-spin")} />
            </Button>
          </div>

          {usersError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <p className="font-medium">{t("admin.users.loadFailed")}</p>
              <p className="mt-1 font-mono text-xs opacity-80">{usersError}</p>
            </div>
          )}

          {usersLoading && users.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {users.map((u) => (
            <div
              key={u.id}
              className="flex flex-col gap-3 rounded-xl border bg-card p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{u.email ?? "—"}</span>
                  {u.role && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        u.role === "admin" || u.role === "owner"
                          ? "bg-primary/10 text-primary"
                          : u.role === "trusted_contributor"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            : "border bg-background text-muted-foreground"
                      )}
                    >
                      {u.role}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {u.created_at && (
                    <span>{t("admin.users.registeredColumn")}: {new Date(u.created_at).toLocaleDateString()}</span>
                  )}
                  {u.last_sign_in_at && (
                    <span>· {t("admin.users.lastSignInColumn")}: {new Date(u.last_sign_in_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>

              {u.id !== user?.id && (
                <div className="flex shrink-0 gap-2">
                  {u.role !== "trusted_contributor" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                      disabled={actionLoading}
                      onClick={() => handleSetRole(u.id, "trusted_contributor")}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {t("admin.users.promoteToTrusted")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 border-destructive/30 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
                      disabled={actionLoading}
                      onClick={() => handleSetRole(u.id, "")}
                    >
                      <ShieldOff className="h-3.5 w-3.5" />
                      {t("admin.users.removeRole")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}

          {!usersLoading && users.length === 0 && !usersError && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("admin.users.noUsers")}
            </p>
          )}
        </div>
      )}

      {/* ── Stats tab ─────────────────────────────────────── */}
      {tab === "stats" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("admin.stats.title")}</h2>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8"
              onClick={loadStats}
              disabled={statsLoading}
              aria-label="Aggiorna statistiche"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", statsLoading && "animate-spin")} />
            </Button>
          </div>

          {statsLoading && !stats && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label={t("admin.stats.totalUsers")} value={stats.totalUsers} />
              <StatCard label={t("admin.stats.totalGlobalProcedures")} value={stats.approvedProcs} />
              <StatCard
                label={t("admin.stats.pendingProcedures")}
                value={stats.pendingProcs}
                highlight={stats.pendingProcs > 0}
              />
              <StatCard label={t("admin.stats.rejectedProcedures")} value={stats.rejectedProcs} />
            </div>
          )}
        </div>
      )}

      {/* ── Reject dialog ─────────────────────────────────── */}
      <Dialog open={rejectDialogProc !== null} onOpenChange={(v) => { if (!v) closeRejectDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.procedures.confirmReject")}</DialogTitle>
            <DialogDescription>
              &ldquo;{rejectDialogProc?.title}&rdquo;
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t("admin.procedures.rejectionReasonLabel")}
              </label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t("admin.procedures.rejectionReasonPlaceholder")}
                rows={3}
                className="min-h-0"
                disabled={actionLoading}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeRejectDialog} disabled={actionLoading}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectConfirm}
                disabled={actionLoading}
                className="gap-2"
              >
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("admin.procedures.reject")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight = false
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 shadow-sm",
        highlight ? "border-destructive/30 bg-destructive/5" : "bg-card"
      )}
    >
      <div className={cn("text-2xl font-bold tabular-nums", highlight && "text-destructive")}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
