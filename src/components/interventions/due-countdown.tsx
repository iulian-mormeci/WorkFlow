"use client";

import { useEffect, useState } from "react";
import type { Intervention } from "@/lib/db/workflow-db";
import { formatDueCountdown, isInterventionOverdue } from "@/lib/interventions/intervention-helpers";

export function DueCountdown({
  intervention,
  className
}: {
  intervention: Pick<Intervention, "dueAt" | "status">;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  if (!intervention.dueAt || intervention.status === "completed") return null;

  const overdue = isInterventionOverdue(intervention as Intervention, now);
  const label = formatDueCountdown(intervention as Intervention, now);

  return (
    <span
      className={
        className ??
        (overdue
          ? "font-semibold text-destructive"
          : "text-muted-foreground")
      }
    >
      {label}
    </span>
  );
}
