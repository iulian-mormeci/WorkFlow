"use client";

import { useEffect, useState } from "react";
import type { Intervention } from "@/lib/db/workflow-db";
import {
  formatDueCountdown,
  isInterventionCompleted,
  isInterventionOverdue
} from "@/lib/interventions/intervention-helpers";

export function DueCountdown({
  intervention,
  className
}: {
  intervention: Pick<Intervention, "dueAt" | "status">;
  className?: string;
}) {
  /** Null until after mount so SSR + first client paint match (avoid hydration #418). */
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const bump = () => setNow(Date.now());
    bump();
    const t = window.setInterval(bump, 30000);
    return () => window.clearInterval(t);
  }, []);

  if (!intervention.dueAt || isInterventionCompleted(intervention)) return null;

  if (now == null) {
    return (
      <span className={className ?? "text-muted-foreground"} aria-hidden="true">
        —
      </span>
    );
  }

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
