"use client";

import { Badge } from "@/components/ui/badge";
import type { Intervention } from "@/lib/db/workflow-db";
import {
  isInterventionOverdue,
  normalizeTimerRunState
} from "@/lib/interventions/intervention-helpers";

export function InterventionStatusBadge({ intervention }: { intervention: Intervention }) {
  const overdue = isInterventionOverdue(intervention);
  const timerState = normalizeTimerRunState(intervention);

  if (intervention.status === "completed") {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">
        Completed
      </Badge>
    );
  }
  if (overdue) {
    return (
      <Badge className="border-destructive/40 bg-destructive/10 text-destructive dark:bg-destructive/20">
        Overdue
      </Badge>
    );
  }
  if (timerState === "running") {
    return (
      <Badge className="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-200">
        Timer running
      </Badge>
    );
  }
  if (timerState === "paused") {
    return (
      <Badge className="border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-100">
        Timer paused
      </Badge>
    );
  }
  return (
    <Badge className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
      Open
    </Badge>
  );
}
