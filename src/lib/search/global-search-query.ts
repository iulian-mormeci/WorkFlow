import { db } from "@/lib/db/workflow-db";
import { procedureHtmlToText } from "@/lib/procedures/sanitize-html";

export type GlobalSearchKind =
  | "intervention"
  | "activity"
  | "procedure"
  | "globalProcedure"
  | "client"
  | "document"
  | "ticket";

export type GlobalSearchResult = {
  kind: GlobalSearchKind;
  id: string;
  title: string;
  preview?: string;
  meta?: string;
  statusKey?: string;
  statusScope?: "intervention" | "activity" | "ticket";
  badge?: "pdf" | "global" | "personal";
  href: string;
  score: number;
  sortTs: number;
};

const DAY_MS = 86_400_000;
const MAX_RESULTS = 40;

function procedurePreview(content?: string, maxLines = 3): string {
  const text = procedureHtmlToText(content ?? "").trim();
  if (!text) return "";
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join(" · ");
}

function matchScore(haystack: string, query: string, title: string): number {
  const q = query.toLowerCase();
  const h = haystack.toLowerCase();
  const t = title.toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  if (!tokens.every((tok) => h.includes(tok))) return 0;

  let score = 1;
  if (t.startsWith(q)) score += 10;
  else if (t.includes(q)) score += 5;

  for (const tok of tokens) {
    if (t.includes(tok)) score += 2;
    else if (h.includes(tok)) score += 0.75;
  }
  return score;
}

function recencyBoost(sortTs: number): number {
  if (!sortTs) return 0;
  const age = Date.now() - sortTs;
  if (age < 0) return 1;
  if (age <= 7 * DAY_MS) return 4;
  if (age <= 30 * DAY_MS) return 2.5;
  if (age <= 90 * DAY_MS) return 1.5;
  return 0;
}

function tsFromIso(iso?: string): number {
  if (!iso) return 0;
  const n = new Date(iso).getTime();
  return Number.isFinite(n) ? n : 0;
}

function interventionStatusKey(
  status?: string,
  dueAt?: string
): { key: string; scope: "intervention" } {
  if (status === "completed") return { key: "completed", scope: "intervention" };
  if (status === "in_progress") return { key: "inProgress", scope: "intervention" };
  if (dueAt && tsFromIso(dueAt) < Date.now()) return { key: "overdue", scope: "intervention" };
  return { key: "open", scope: "intervention" };
}

function pushResult(
  bucket: GlobalSearchResult[],
  item: Omit<GlobalSearchResult, "score"> & { baseScore: number }
) {
  if (item.baseScore <= 0) return;
  bucket.push({
    ...item,
    score: item.baseScore + recencyBoost(item.sortTs)
  });
}

export async function queryGlobalSearch(query: string): Promise<GlobalSearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const [
    clients,
    interventions,
    activities,
    procedures,
    globalProcedures,
    documents,
    tickets
  ] = await Promise.all([
    db.clients.limit(500).toArray(),
    db.interventions.orderBy("updatedAt").reverse().limit(800).toArray(),
    db.activities.orderBy("updatedAt").reverse().limit(400).toArray(),
    db.procedures.orderBy("updatedAt").reverse().limit(400).toArray(),
    db.globalProcedures.orderBy("updatedAt").reverse().limit(400).toArray(),
    db.documents.orderBy("createdAt").reverse().limit(400).toArray(),
    db.tickets.orderBy("updatedAt").reverse().limit(400).toArray()
  ]);

  const clientById = new Map(clients.map((c) => [c.id, c.name]));
  const results: GlobalSearchResult[] = [];

  for (const c of clients) {
    const hay = [c.name, c.city, c.address, c.phone, c.email, c.notes, c.contactPerson]
      .filter(Boolean)
      .join(" ");
    pushResult(results, {
      kind: "client",
      id: c.id,
      title: c.name,
      meta: [c.city, c.phone].filter(Boolean).join(" · ") || undefined,
      href: `/clients/${c.id}`,
      sortTs: tsFromIso(c.updatedAt),
      baseScore: matchScore(hay, q, c.name)
    });
  }

  for (const it of interventions) {
    const clientName = clientById.get(it.clientId) ?? "";
    const hay = [clientName, it.type, it.notes, it.workCategory, it.dueAt, it.startAt]
      .filter(Boolean)
      .join(" ");
    const title =
      it.workCategory === "activity"
        ? `${clientName} — ${it.type || "Activity"}`
        : `${clientName} — ${it.type || "Intervention"}`;
    const when = it.startAt ?? it.dueAt;
    const { key, scope } = interventionStatusKey(it.status, it.dueAt);
    pushResult(results, {
      kind: "intervention",
      id: it.id,
      title,
      preview: it.notes?.trim().slice(0, 160) || undefined,
      meta: when ? new Date(when).toISOString() : undefined,
      statusKey: key,
      statusScope: scope,
      href: `/interventions/${it.id}`,
      sortTs: tsFromIso(it.updatedAt ?? it.startAt ?? it.dueAt),
      baseScore: matchScore(hay, q, title)
    });
  }

  for (const a of activities) {
    const hay = [a.title, a.description, a.category, a.status, a.priority].filter(Boolean).join(" ");
    pushResult(results, {
      kind: "activity",
      id: a.id,
      title: a.title,
      preview: a.description?.trim().slice(0, 160) || undefined,
      meta: a.dueAt ? new Date(a.dueAt).toISOString() : undefined,
      statusKey: a.status,
      statusScope: "activity",
      href: "/activities",
      sortTs: tsFromIso(a.updatedAt ?? a.dueAt),
      baseScore: matchScore(hay, q, a.title)
    });
  }

  for (const p of procedures) {
    const hay = [p.title, p.brand, p.model, p.content, ...(p.tags ?? [])].filter(Boolean).join(" ");
    pushResult(results, {
      kind: "procedure",
      id: p.id,
      title: p.title,
      preview: procedurePreview(p.content) || undefined,
      meta: [p.brand, p.model].filter(Boolean).join(" · ") || undefined,
      badge: "personal",
      href: "/procedures",
      sortTs: tsFromIso(p.updatedAt),
      baseScore: matchScore(hay, q, p.title)
    });
  }

  for (const p of globalProcedures) {
    const hay = [p.title, p.brand, p.model, p.content, ...(p.tags ?? [])].filter(Boolean).join(" ");
    pushResult(results, {
      kind: "globalProcedure",
      id: p.id,
      title: p.title,
      preview: procedurePreview(p.content) || undefined,
      meta: [p.brand, p.model].filter(Boolean).join(" · ") || undefined,
      badge: "global",
      href: "/procedures",
      sortTs: tsFromIso(p.updatedAt),
      baseScore: matchScore(hay, q, p.title)
    });
  }

  for (const d of documents) {
    pushResult(results, {
      kind: "document",
      id: d.id,
      title: d.title,
      meta: new Date(d.createdAt).toISOString(),
      badge: "pdf",
      href: `/documents/${d.id}`,
      sortTs: tsFromIso(d.createdAt),
      baseScore: matchScore(d.title, q, d.title)
    });
  }

  for (const tk of tickets) {
    const clientName = tk.clientId ? clientById.get(tk.clientId) : "";
    const hay = [tk.title, tk.description, clientName].filter(Boolean).join(" ");
    pushResult(results, {
      kind: "ticket",
      id: tk.id,
      title: tk.title,
      preview: tk.description?.trim().slice(0, 160) || undefined,
      meta: tk.dueAt ? new Date(tk.dueAt).toISOString() : clientName || undefined,
      statusKey: tk.status,
      statusScope: "ticket",
      href: "/crm-tickets",
      sortTs: tsFromIso(tk.updatedAt ?? tk.dueAt),
      baseScore: matchScore(hay, q, tk.title)
    });
  }

  return results
    .sort((a, b) => b.score - a.score || b.sortTs - a.sortTs)
    .slice(0, MAX_RESULTS);
}
