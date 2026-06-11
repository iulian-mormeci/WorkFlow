"use client";

import { useCallback, useEffect, useState } from "react";
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
  RefreshCw
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

type TabId = "users" | "procedures" | "stats";

/* ─── component ────────────────────────────────────────────────── */

export function AdminClient() {
  const t = useTranslations();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);

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
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setUsersLoading(true);
    setUsersError(null);
    const { data, error } = await supabase.rpc("workflow_admin_list_users");
    if (error) setUsersError(error.message);
    else setUsers((data as AdminUser[]) ?? []);
    setUsersLoading(false);
  }, []);

  const loadPending = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
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
  }, []);

  const loadStats = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setStatsLoading(true);
    const { data } = await supabase.rpc("workflow_admin_stats");
    if (data) setStats(data as AdminStats);
    setStatsLoading(false);
  }, []);

  useEffect(() => {
    void loadUsers();
    void loadPending();
    void loadStats();
  }, [loadUsers, loadPending, loadStats]);

  /* ─── actions ─────────────────────────────────────────────────── */

  async function handleSetRole(targetId: string, newRole: string) {
    const supabase = createSupabaseBrowserClient();
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
    const supabase = createSupabaseBrowserClient();
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
      await loadPending();
      await loadStats();
    }
    setActionLoading(false);
  }

  async function handleRejectConfirm() {
    const supabase = createSupabaseBrowserClient();
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
      await loadPending();
      await loadStats();
    }
    setActionLoading(false);
  }

  /* ─── render helpers ─────────────────────────────────────────── */

  const TABS: { id: TabId; icon: React.ElementType; label: string }[] = [
    { id: "procedures", icon: ClipboardList, label: t("admin.tabs.procedures") },
    { id: "users",     icon: Users,          label: t("admin.tabs.users") },
    { id: "stats",     icon: BarChart3,      label: t("admin.tabs.stats") }
  ];

  return (
    <>
      {/* Tab strip */}
      <div className="flex gap-1 rounded-xl border bg-muted/30 p-1">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
              tab === id
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
            {id === "procedures" && pending.length > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Users tab ────────────────────────────────────────── */}
      {tab === "users" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("admin.users.title")}</h2>
            <Button size="sm" variant="ghost" onClick={loadUsers} disabled={usersLoading}>
              <RefreshCw className={cn("h-3.5 w-3.5", usersLoading && "animate-spin")} />
            </Button>
          </div>
          {usersError && (
            <p className="text-sm text-destructive">{t("admin.users.loadFailed")}</p>
          )}
          {users.map((u) => (
            <div
              key={u.id}
              className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="truncate text-sm font-medium">{u.email ?? "—"}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {u.created_at && (
                    <span>
                      {t("admin.users.registeredColumn")}:{" "}
                      {new Date(u.created_at).toLocaleDateString()}
                    </span>
                  )}
                  {u.last_sign_in_at && (
                    <span>
                      {t("admin.users.lastSignInColumn")}:{" "}
                      {new Date(u.last_sign_in_at).toLocaleDateString()}
                    </span>
                  )}
                  {u.role && (
                    <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium">
                      {u.role}
                    </span>
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
                      className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
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
            <p className="text-sm text-muted-foreground">{t("admin.users.noUsers")}</p>
          )}
        </div>
      )}

      {/* ── Pending procedures tab ───────────────────────────── */}
      {tab === "procedures" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("admin.procedures.title")}</h2>
            <Button size="sm" variant="ghost" onClick={loadPending} disabled={pendingLoading}>
              <RefreshCw className={cn("h-3.5 w-3.5", pendingLoading && "animate-spin")} />
            </Button>
          </div>
          {pendingError && (
            <p className="text-sm text-destructive">{t("admin.procedures.loadFailed")}</p>
          )}
          {pending.map((proc) => (
            <div key={proc.id} className="rounded-xl border bg-muted/30 p-3.5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="font-medium">{proc.title}</div>
                  <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    <span>{proc.category}</span>
                    {proc.brand && <span>· {proc.brand}</span>}
                    {proc.model && <span>/ {proc.model}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("admin.procedures.submittedAt")}:{" "}
                    {new Date(proc.created_at).toLocaleDateString()}
                  </div>
                  {proc.content && (
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                      {proc.content.replace(/<[^>]+>/g, " ").trim()}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 text-xs text-destructive hover:text-destructive"
                    disabled={actionLoading}
                    onClick={() => { setRejectDialogProc(proc); setRejectReason(""); }}
                  >
                    <XCircle className="h-4 w-4" />
                    {t("admin.procedures.reject")}
                  </Button>
                  <Button
                    size="sm"
                    className="h-9 gap-1.5 text-xs"
                    disabled={actionLoading}
                    onClick={() => handleApprove(proc)}
                  >
                    <CheckCircle className="h-4 w-4" />
                    {t("admin.procedures.approve")}
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {!pendingLoading && pending.length === 0 && !pendingError && (
            <p className="text-sm text-muted-foreground">{t("admin.procedures.noPending")}</p>
          )}
        </div>
      )}

      {/* ── Stats tab ────────────────────────────────────────── */}
      {tab === "stats" && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">{t("admin.stats.title")}</h2>
          {statsLoading && <p className="text-sm text-muted-foreground">…</p>}
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

      {/* ── Reject confirmation dialog ─────────────────────────── */}
      <Dialog
        open={rejectDialogProc !== null}
        onOpenChange={(v) => { if (!v) { setRejectDialogProc(null); setRejectReason(""); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.procedures.confirmReject")}</DialogTitle>
            <DialogDescription>&ldquo;{rejectDialogProc?.title}&rdquo;</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
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
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => { setRejectDialogProc(null); setRejectReason(""); }}
                disabled={actionLoading}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectConfirm}
                disabled={actionLoading}
              >
                {t("admin.procedures.reject")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
    <div className={cn("rounded-xl border p-4", highlight ? "border-destructive/50 bg-destructive/5" : "bg-muted/30")}>
      <div className={cn("text-2xl font-bold", highlight && "text-destructive")}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
