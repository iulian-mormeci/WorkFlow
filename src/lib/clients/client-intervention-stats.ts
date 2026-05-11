import type { Intervention } from "@/lib/db/workflow-db";

export type ClientInterventionStats = {
  count: number;
  /** Latest intervention `startAt` (ISO). */
  lastStartAt?: string;
};

/** Aggregates from local interventions (same source as list/detail UI). */
export function interventionStatsByClientId(
  interventions: Intervention[]
): Map<string, ClientInterventionStats> {
  const map = new Map<string, ClientInterventionStats>();
  for (const iv of interventions) {
    const id = iv.clientId;
    if (!id) continue;
    const cur = map.get(id) ?? { count: 0, lastStartAt: undefined };
    cur.count += 1;
    if (iv.startAt) {
      if (!cur.lastStartAt || iv.startAt > cur.lastStartAt) {
        cur.lastStartAt = iv.startAt;
      }
    }
    map.set(id, cur);
  }
  return map;
}
