"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Bell, BellOff, Link2, Search, X } from "lucide-react";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  db,
  type Intervention,
  type ReminderPreset,
  type Ticket
} from "@/lib/db/workflow-db";
import {
  createTicket,
  updateTicket,
  type TicketFormValues
} from "@/lib/tickets/ticket-mutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";

const REMINDER_PRESETS: readonly ReminderPreset[] = ["1d", "2h", "30m", "custom"] as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isoToLocalParts(iso?: string): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}

function localPartsToIso(date: string, time: string): string | undefined {
  if (!date) return undefined;
  const [y, m, d] = date.split("-").map((v) => Number(v));
  if (!y || !m || !d) return undefined;
  let hh = 9;
  let mm = 0;
  if (time) {
    const [h, min] = time.split(":").map((v) => Number(v));
    if (Number.isFinite(h)) hh = h;
    if (Number.isFinite(min)) mm = min;
  }
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

type LinkedIntervention = { id: string; clientId: string } | null;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Provide to edit; omit to create a new ticket. */
  ticket?: Ticket | null;
};

export function TicketFormDialog({ open, onOpenChange, ticket }: Props) {
  const t = useTranslations();
  const { toast } = useToast();
  const isEdit = Boolean(ticket);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Ticket["priority"]>("medium");
  const [status, setStatus] = useState<Ticket["status"]>("open");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderPreset, setReminderPreset] = useState<ReminderPreset>("2h");
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [linked, setLinked] = useState<LinkedIntervention>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const due = isoToLocalParts(ticket?.dueAt);
    const custom = isoToLocalParts(ticket?.reminderCustomAt);
    setTitle(ticket?.title ?? "");
    setDescription(ticket?.description ?? "");
    setPriority(ticket?.priority ?? "medium");
    setStatus(ticket?.status ?? "open");
    setDueDate(due.date);
    setDueTime(due.time);
    setRemindersEnabled(ticket?.remindersEnabled ?? false);
    setReminderPreset(ticket?.reminderPreset ?? "2h");
    setCustomDate(custom.date);
    setCustomTime(custom.time);
    setLinked(
      ticket?.interventionId
        ? { id: ticket.interventionId, clientId: ticket.clientId ?? "" }
        : null
    );
    setSaving(false);
  }, [open, ticket]);

  const canSave = useMemo(() => title.trim().length > 2, [title]);

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    const dueAt = localPartsToIso(dueDate, dueTime);
    const reminderCustomAt =
      remindersEnabled && reminderPreset === "custom"
        ? localPartsToIso(customDate, customTime)
        : undefined;

    const values: TicketFormValues = {
      title,
      description,
      priority,
      status,
      dueAt,
      remindersEnabled,
      reminderPreset,
      reminderCustomAt,
      interventionId: linked?.id,
      clientId: linked?.clientId || undefined
    };

    try {
      if (ticket) {
        await updateTicket(ticket, values);
        toast({
          title: t("tickets.toasts.updatedTitle"),
          description: t("tickets.toasts.savedLocally")
        });
      } else {
        await createTicket(values);
        toast({
          title: t("tickets.toasts.createdTitle"),
          description: t("tickets.toasts.savedLocally")
        });
      }
      onOpenChange(false);
    } catch (e) {
      toast({
        title: t("tickets.toasts.saveFailedTitle"),
        description: e instanceof Error ? e.message : t("common.unknownError"),
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("tickets.form.editTitle") : t("tickets.form.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("tickets.form.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <Label>{t("tickets.fields.title")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("tickets.fields.titlePlaceholder")}
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label>{t("tickets.fields.description")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("tickets.fields.descriptionPlaceholder")}
            />
          </div>

          <div className="grid gap-2">
            <Label>{t("tickets.fields.priority")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {TICKET_PRIORITIES.map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={priority === p ? "default" : "outline"}
                  onClick={() => setPriority(p)}
                >
                  {t(`tickets.priority.${p}`)}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>{t("tickets.fields.status")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {TICKET_STATUSES.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={status === s ? "default" : "outline"}
                  onClick={() => setStatus(s)}
                >
                  {t(`tickets.status.${s}`)}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("tickets.fields.dueDate")}</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>{t("tickets.fields.dueTime")}</Label>
              <Input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                disabled={!dueDate}
              />
            </div>
          </div>

          <div className="rounded-xl border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {remindersEnabled ? (
                  <Bell className="h-4 w-4 text-primary" />
                ) : (
                  <BellOff className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <div className="text-sm font-medium">{t("tickets.fields.reminders")}</div>
                  <div className="text-xs text-muted-foreground">
                    {dueDate
                      ? t("tickets.fields.remindersHint")
                      : t("tickets.fields.remindersNeedsDue")}
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant={remindersEnabled ? "default" : "outline"}
                onClick={() => setRemindersEnabled((v) => !v)}
                disabled={!dueDate}
              >
                {remindersEnabled ? t("common.on") : t("common.off")}
              </Button>
            </div>

            {remindersEnabled && dueDate ? (
              <div className="mt-3 grid gap-2">
                <Label>{t("tickets.fields.reminderPreset")}</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {REMINDER_PRESETS.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant={reminderPreset === p ? "default" : "outline"}
                      onClick={() => setReminderPreset(p)}
                    >
                      {t(`tickets.reminderPresets.${p}`)}
                    </Button>
                  ))}
                </div>
                {reminderPreset === "custom" ? (
                  <div className="mt-1 grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>{t("tickets.fields.reminderCustomDate")}</Label>
                      <Input
                        type="date"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>{t("tickets.fields.reminderCustomTime")}</Label>
                      <Input
                        type="time"
                        value={customTime}
                        onChange={(e) => setCustomTime(e.target.value)}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <InterventionPicker value={linked} onChange={setLinked} />

          {ticket ? (
            <div className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">{t("tickets.history.title")}</div>
              <div className="mt-1">
                {t("tickets.history.created", {
                  date: new Date(ticket.createdAt).toLocaleString()
                })}
              </div>
              <div>
                {t("tickets.history.updated", {
                  date: new Date(ticket.updatedAt).toLocaleString()
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" disabled={!canSave || saving} onClick={handleSave}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InterventionPicker({
  value,
  onChange
}: {
  value: LinkedIntervention;
  onChange: (v: LinkedIntervention) => void;
}) {
  const t = useTranslations();
  const [q, setQ] = useState("");

  const clients = useLiveQuery(async () => db.clients.toArray(), []);
  const interventions = useLiveQuery(
    async () => db.interventions.orderBy("updatedAt").reverse().toArray(),
    []
  );

  const clientName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients ?? []) map.set(c.id, c.name);
    return map;
  }, [clients]);

  function labelFor(iv: Intervention): string {
    const name = clientName.get(iv.clientId) ?? t("common.client");
    const dateIso = iv.startAt ?? iv.dueAt ?? iv.createdAt;
    const date = dateIso ? new Date(dateIso).toLocaleDateString() : "";
    return [name, iv.type, date].filter(Boolean).join(" · ");
  }

  const selected = useMemo(
    () => (value ? (interventions ?? []).find((iv) => iv.id === value.id) ?? null : null),
    [value, interventions]
  );

  const matches = useMemo(() => {
    const qv = q.trim().toLowerCase();
    const list = interventions ?? [];
    const filtered = qv
      ? list.filter((iv) => labelFor(iv).toLowerCase().includes(qv))
      : list;
    return filtered.slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, interventions, clientName]);

  return (
    <div className="grid gap-2">
      <Label className="flex items-center gap-2">
        <Link2 className="h-4 w-4" />
        {t("tickets.fields.linkedIntervention")}
      </Label>

      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border bg-muted/40 px-3 py-2">
          <span className="truncate text-sm">
            {selected ? labelFor(selected) : t("tickets.fields.linkedInterventionUnknown")}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            aria-label={t("tickets.fields.unlinkIntervention")}
            onClick={() => onChange(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("tickets.fields.linkedInterventionSearch")}
              className="pl-9"
            />
          </div>
          {q.trim() ? (
            <div className="max-h-44 overflow-y-auto rounded-xl border">
              {matches.length === 0 ? (
                <div className="px-3 py-3 text-sm text-muted-foreground">
                  {t("tickets.fields.linkedInterventionNoResults")}
                </div>
              ) : (
                matches.map((iv) => (
                  <button
                    key={iv.id}
                    type="button"
                    className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onClick={() => {
                      onChange({ id: iv.id, clientId: iv.clientId });
                      setQ("");
                    }}
                  >
                    <span className="truncate">{labelFor(iv)}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
