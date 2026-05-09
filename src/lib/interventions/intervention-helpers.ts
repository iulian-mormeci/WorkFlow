import type { Intervention, TimerRunState } from "@/lib/db/workflow-db";

export function isInterventionOverdue(i: Intervention, now = Date.now()): boolean {
  if (i.status === "completed" || !i.dueAt) return false;
  return new Date(i.dueAt).getTime() < now;
}

export function normalizeTimerRunState(i: Intervention): TimerRunState {
  if (i.timerRunState) return i.timerRunState;
  if (i.timerStartedAt) return "running";
  return "idle";
}

/** Total tracked seconds including an active running segment. */
export function getTimerElapsedSeconds(i: Intervention, now = Date.now()): number {
  const acc = Math.max(0, Math.floor(Number(i.timerAccumulatedSeconds ?? 0)));
  const state = normalizeTimerRunState(i);
  if (state !== "running" || !i.timerStartedAt) return acc;
  const t0 = new Date(i.timerStartedAt).getTime();
  if (!Number.isFinite(t0)) return acc;
  const seg = Math.max(0, Math.floor((now - t0) / 1000));
  return acc + seg;
}

export function formatElapsedHms(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Milliseconds until due (negative if overdue). */
export function msUntilDue(i: Intervention, now = Date.now()): number | null {
  if (!i.dueAt || i.status === "completed") return null;
  return new Date(i.dueAt).getTime() - now;
}

export function formatDueCountdown(i: Intervention, now = Date.now()): string | null {
  const ms = msUntilDue(i, now);
  if (ms == null) return null;
  if (ms <= 0) return "Overdue";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m % 60}m left`;
  return `${m}m left`;
}
