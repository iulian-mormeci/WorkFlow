"use client";

import { Link } from "@/i18n/navigation";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Building2, Calendar, ChevronRight, MapPin, Phone, Plus, Search, Wrench } from "lucide-react";
import { db, type Client, type ClientType } from "@/lib/db/workflow-db";
import { interventionStatsByClientId } from "@/lib/clients/client-intervention-stats";
import { clientTypeLabel } from "@/lib/clients/client-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type TypeFilter = "all" | ClientType;
type SortKey = "name" | "lastVisit" | "count";

function formatShortDate(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } catch {
    return "—";
  }
}

export function ClientsClient() {
  const t = useTranslations();
  useWorkflowLiveEpoch();
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>();

  const clients = useLiveQuery(async () => db.clients.orderBy("name").toArray(), []);
  const interventions = useLiveQuery(async () => db.interventions.toArray(), []);

  const stats = useMemo(
    () => interventionStatsByClientId(interventions ?? []),
    [interventions]
  );

  const filtered = useMemo(() => {
    let rows = [...(clients ?? [])];
    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((c) => {
        const blob = [
          c.name,
          c.contactPerson,
          c.city,
          c.address,
          c.phone,
          c.email,
          c.postalCode
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(needle);
      });
    }
    if (typeFilter !== "all") {
      rows = rows.filter((c) => (c.clientType ?? "other") === typeFilter);
    }
    rows.sort((a, b) => {
      if (sortKey === "name") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
      const sa = stats.get(a.id);
      const sb = stats.get(b.id);
      if (sortKey === "lastVisit") {
        const la = sa?.lastStartAt ?? "";
        const lb = sb?.lastStartAt ?? "";
        return lb.localeCompare(la);
      }
      const ca = sa?.count ?? 0;
      const cb = sb?.count ?? 0;
      return cb - ca;
    });
    return rows;
  }, [clients, q, typeFilter, sortKey, stats]);

  function openNew() {
    setEditId(undefined);
    setFormOpen(true);
  }

  function openEdit(id: string, e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setEditId(id);
    setFormOpen(true);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-4 md:pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{t("clients.page.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("clients.page.subtitle")}
          </p>
        </div>
        <Button size="lg" className="min-h-11 shrink-0 gap-2" onClick={openNew}>
          <Plus className="h-5 w-5" />
          {t("clients.actions.new")}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("clients.search.placeholder")}
            className="min-h-12 pl-10 text-base"
            aria-label={t("clients.search.aria")}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
          <div className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t("clients.filters.typeLabel")}</span>
            <select
              className="min-h-12 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            >
              <option value="all">{t("clients.filters.allTypes")}</option>
              <option value="company">{t("clients.types.company")}</option>
              <option value="private">{t("clients.types.private")}</option>
              <option value="restaurant">{t("clients.types.restaurant")}</option>
              <option value="shop">{t("clients.types.shop")}</option>
              <option value="other">{t("clients.types.other")}</option>
            </select>
          </div>
          <div className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t("clients.filters.sortLabel")}</span>
            <select
              className="min-h-12 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="name">{t("clients.sort.name")}</option>
              <option value="lastVisit">{t("clients.sort.lastVisit")}</option>
              <option value="count">{t("clients.sort.count")}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(filtered as Client[]).map((c) => {
          const st = stats.get(c.id);
          const last = st?.lastStartAt;
          const count = st?.count ?? 0;
          return (
            <div
              key={c.id}
              className={cn(
                "flex flex-col rounded-xl border bg-card p-3.5 text-left shadow-sm transition sm:p-4",
                "hover:border-primary/30 hover:bg-muted/30"
              )}
            >
              <div className="flex gap-2">
                <Link
                  href={`/clients/${c.id}`}
                  className="group min-w-0 flex-1 rounded-xl outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-base font-semibold tracking-tight">{c.name}</span>
                        <Badge className="shrink-0 border-transparent bg-secondary font-normal text-secondary-foreground">
                          {clientTypeLabel(c.clientType)}
                        </Badge>
                      </div>
                      {c.contactPerson ? (
                        <p className="mt-1 truncate text-sm text-muted-foreground">{c.contactPerson}</p>
                      ) : null}
                    </div>
                    <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                    {(c.city || c.address) && (
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="line-clamp-2">
                          {[c.address, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    )}
                    {c.phone ? (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 shrink-0" />
                        <span className="truncate">{c.phone}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      {t("clients.card.lastPrefix")} {formatShortDate(last)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5" />
                      {t("clients.card.interventionsCount", { count })}
                    </span>
                  </div>
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 shrink-0 self-start px-3"
                  onClick={() => openEdit(c.id)}
                >
                  {t("common.edit")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {(clients ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/30 px-6 py-14 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-base font-medium">{t("clients.empty.title")}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {t("clients.empty.body")}
          </p>
          <Button size="lg" className="mt-6 min-h-12 gap-2" onClick={openNew}>
            <Plus className="h-5 w-5" />
            {t("clients.empty.cta")}
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground">
          {t("clients.emptyFiltered")}
        </div>
      ) : null}

      <ClientFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditId(undefined);
        }}
        mode={editId ? "edit" : "new"}
        clientId={editId}
        onSaved={() => {}}
      />
    </div>
  );
}
