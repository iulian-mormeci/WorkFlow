"use client";

import { Badge } from "@/components/ui/badge";
import type { Intervention } from "@/lib/db/workflow-db";

export function InterventionStatusBadge({ intervention }: { intervention: Intervention }) {
  const status = intervention.timerStartedAt
    ? "in_progress"
    : intervention.status === "completed"
      ? "completed"
      : "open";

  if (status === "completed") {
    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">Completed</Badge>;
  }
  if (status === "in_progress") {
    return <Badge className="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-200">In progress</Badge>;
  }
  return <Badge className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">Open</Badge>;
}

