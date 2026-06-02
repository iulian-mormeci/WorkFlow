"use client";

import { Link } from "@/i18n/navigation";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Wrench,
  Zap
} from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { interventionStatsByClientId } from "@/lib/clients/client-intervention-stats";
import { clientTypeLabel } from "@/lib/clients/client-labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InterventionFormDialog } from "@/components/interventions/intervention-form-dialog";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import {
  isInterventionCompleted,
  preservedWorkflowStatus
} from "@/lib/interventions/intervention-helpers";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

function formatWhen(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function todayLocalDateTimeInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ClientDetailClient({ id }: { id: string }) {
  const t = useTranslations();
  useWorkflowLiveEpoch();
  const [ivOpen, setIvOpen] = useState(false);
  const [quickIvOpen, setQuickIvOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const client = useLiveQuery(async () => db.clients.get(id), [id]);
  const interventions = useLiveQuery(
    async () =>
      (await db.interventions.where("clientId").equals(id).toArray()).sort(
        (a, b) => (b.startAt ?? "").localeCompare(a.startAt ?? "")
      ),
    [id]
  );

  const stats = useMemo(
    () => interventionStatsByClientId(interventions ?? []),
    [interventions]
  );
  const st = stats.get(id);

  if (client === undefined) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-center text-sm text-muted-foreground">
        {t("clients.detail.loading")}
      </div>
    );
  }

  if (client === null) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-10">
        <Link
          href="/clients"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("clients.detail.backToClients")}
        </Link>
        <div className="rounded-2xl border bg-muted/30 px-6 py-12 text-center">
          <p className="font-medium">{t("clients.detail.notFoundTitle")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("clients.detail.notFoundBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-4 md:pb-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/clients"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("clients.page.title")}
        </Link>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="h-6 w-6 shrink-0 text-muted-foreground" />
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{client.name}</h1>
              <Badge className="border-transparent bg-secondary text-secondary-foreground">
                {clientTypeLabel(client.clientType)}
              </Badge>
            </div>
            {client.contactPerson ? (
              <p className="text-sm text-muted-foreground">
                {t("clients.detail.contactPrefix")} {client.contactPerson}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {t("clients.detail.lastVisitPrefix")}{" "}
                {st?.lastStartAt
                  ? new Date(st.lastStartAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric"
                    })
                  : "—"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Wrench className="h-4 w-4" />
                {t("clients.detail.interventionsCount", { count: st?.count ?? 0 })}
              </span>
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row lg:w-auto lg:min-w-[12rem] lg:flex-col">
            <Button
              className="min-h-11 flex-1 gap-2 bg-primary font-semibold shadow-sm lg:w-full"
              onClick={() => setQuickIvOpen(true)}
            >
              <Zap className="h-4 w-4" />
              {t("clients.detail.actions.quickIntervention")}
            </Button>
            <Button
              variant="outline"
              className="min-h-11 flex-1 gap-2 lg:w-full"
              onClick={() => setIvOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {t("clients.detail.actions.newIntervention")}
            </Button>
            <Button variant="outline" className="min-h-11 flex-1 gap-2 lg:w-full" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              {t("clients.detail.actions.editClient")}
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 border-t pt-5 text-sm sm:grid-cols-2">
          {(client.address || client.city || client.postalCode) && (
            <div className="flex gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                {client.address ? <div>{client.address}</div> : null}
                <div className="text-muted-foreground">
                  {[client.postalCode, client.city].filter(Boolean).join(" ")}
                </div>
              </div>
            </div>
          )}
          {client.phone ? (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
              <a className="font-medium text-primary hover:underline" href={`tel:${client.phone}`}>
                {client.phone}
              </a>
            </div>
          ) : null}
          {client.email ? (
            <div className="flex items-center gap-2 sm:col-span-2">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <a className="break-all font-medium text-primary hover:underline" href={`mailto:${client.email}`}>
                {client.email}
              </a>
            </div>
          ) : null}
        </div>

        {client.notes ? (
          <p className="mt-4 rounded-xl bg-muted/50 px-4 py-3 text-sm leading-relaxed text-foreground">
            {client.notes}
          </p>
        ) : null}
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t("clients.detail.interventionsTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("clients.detail.interventionsSubtitle")}</p>
        <ul className="mt-4 space-y-2">
          {(interventions ?? []).map((it) => {
            const done = isInterventionCompleted(it);
            return (
              <li key={it.id}>
                <Link
                  href={`/interventions/${it.id}`}
                  className={cn(
                    "flex min-h-14 flex-col gap-1 rounded-2xl border bg-background px-4 py-3 transition",
                    "hover:border-primary/30 hover:bg-muted/40 active:scale-[0.99]"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{it.type || t("common.intervention")}</span>
                    <Badge
                      className={
                        done
                          ? "border-transparent bg-secondary text-secondary-foreground"
                          : "border-primary/30 bg-primary/10 text-primary"
                      }
                    >
                      {preservedWorkflowStatus(it)}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {it.startAt
                      ? formatWhen(it.startAt)
                      : it.dueAt
                        ? `${t("common.duePrefix")} ${formatWhen(it.dueAt)}`
                        : t("common.noDate")}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        {(interventions ?? []).length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
            {t("clients.detail.empty")}
          </div>
        ) : null}
      </div>

      <InterventionFormDialog
        open={quickIvOpen}
        onOpenChange={setQuickIvOpen}
        mode="new"
        initial={{
          clientName: client.name,
          defaultClientId: client.id,
          defaultStartAt: todayLocalDateTimeInput()
        }}
      />

      <InterventionFormDialog
        open={ivOpen}
        onOpenChange={setIvOpen}
        mode="new"
        initial={{
          clientName: client.name,
          defaultClientId: client.id
        }}
      />

      <ClientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        clientId={client.id}
      />
    </div>
  );
}
