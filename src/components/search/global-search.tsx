"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FileText, Search } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Result =
  | { kind: "intervention"; id: string; title: string; subtitle: string; href: string }
  | { kind: "client"; id: string; title: string; subtitle: string; href: string }
  | { kind: "document"; id: string; title: string; subtitle: string; href: string };

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setOpen(true);
      }
      if (open && e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const results = useLiveQuery(async () => {
    const query = q.trim().toLowerCase();
    if (!query) return [] as Result[];

    // iPad performance: cap the amount of data we scan for substring matches.
    // (Dexie indexes help for prefix search, but we intentionally keep "contains" search.)
    const [clients, interventions, documents] = await Promise.all([
      db.clients.limit(400).toArray(),
      db.interventions.orderBy("startAt").reverse().limit(600).toArray(),
      db.documents.orderBy("createdAt").reverse().limit(600).toArray()
    ]);

    const clientById = new Map(clients.map((c) => [c.id, c.name]));

    const res: Result[] = [];

    for (const c of clients) {
      if (c.name.toLowerCase().includes(query)) {
        res.push({
          kind: "client",
          id: c.id,
          title: c.name,
          subtitle: "Client",
          href: "/clients"
        });
      }
    }

    for (const it of interventions) {
      const clientName = clientById.get(it.clientId) ?? "Client";
      const hay = `${clientName} ${it.type} ${(it.notes ?? "")}`.toLowerCase();
      if (hay.includes(query)) {
        res.push({
          kind: "intervention",
          id: it.id,
          title: clientName,
          subtitle: `${new Date(it.startAt).toLocaleString()} • ${it.type}`,
          href: `/interventions/${it.id}`
        });
      }
    }

    for (const d of documents) {
      if (d.title.toLowerCase().includes(query)) {
        res.push({
          kind: "document",
          id: d.id,
          title: d.title,
          subtitle: `${new Date(d.createdAt).toLocaleString()} • ${d.pageCount} pages`,
          href: `/documents/${d.id}`
        });
      }
    }

    return res.slice(0, 30);
  }, [q]);

  const placeholder = useMemo(() => "Search… (⌘K)", []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 flex w-full items-center gap-2 rounded-2xl border bg-muted px-3 py-3 text-left text-sm text-muted-foreground hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1">{placeholder}</span>
        <span className="rounded-lg border bg-background px-2 py-0.5 text-xs">
          ⌘K
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Global search</DialogTitle>
          </DialogHeader>

          <div className="mt-3 grid gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search interventions, clients, documents…"
                className="pl-9"
              />
            </div>

            <div className="overflow-hidden rounded-2xl border">
              <div className="divide-y">
                {(results ?? []).map((r) => (
                  <Link
                    key={`${r.kind}-${r.id}`}
                    href={r.href}
                    onClick={() => setOpen(false)}
                    className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{r.title}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {r.subtitle}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.kind === "document" ? <FileText className="h-4 w-4" /> : null}
                    </div>
                  </Link>
                ))}

                {(results ?? []).length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {q.trim() ? "No results." : "Type to search."}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

