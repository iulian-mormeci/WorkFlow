"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  CLIENT_TYPES,
  type Client,
  type ClientType,
  db
} from "@/lib/db/workflow-db";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";
import { performClientCloudSyncDelete } from "@/lib/sync/cloud-delete";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { clientTypeLabel } from "@/lib/clients/client-labels";
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "new" | "edit";
  clientId?: string;
  onSaved?: () => void;
};

const emptyForm = () => ({
  name: "",
  contactPerson: "",
  address: "",
  city: "",
  postalCode: "",
  phone: "",
  email: "",
  clientType: "other" as ClientType,
  notes: ""
});

export function ClientFormDialog(props: Props) {
  const { open, onOpenChange, mode, clientId, onSaved } = props;
  const t = useTranslations();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [f, setF] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (mode === "new") {
        if (!cancelled) setF(emptyForm());
        return;
      }
      if (!clientId) return;
      const row = await db.clients.get(clientId);
      if (cancelled || !row) return;
      setF({
        name: row.name,
        contactPerson: row.contactPerson ?? "",
        address: row.address ?? "",
        city: row.city ?? "",
        postalCode: row.postalCode ?? "",
        phone: row.phone ?? "",
        email: row.email ?? "",
        clientType: row.clientType ?? "other",
        notes: row.notes ?? ""
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, clientId]);

  async function save() {
    const name = f.name.trim();
    if (name.length < 2) {
      toast({
        title: t("clients.form.toasts.nameRequiredTitle"),
        description: t("clients.form.toasts.nameRequiredBody"),
        variant: "destructive"
      });
      return;
    }
    const now = new Date().toISOString();
    setSaving(true);
    try {
      if (mode === "new") {
        const id = crypto.randomUUID();
        const row: Client = {
          id,
          name,
          contactPerson: f.contactPerson.trim() || undefined,
          address: f.address.trim() || undefined,
          city: f.city.trim() || undefined,
          postalCode: f.postalCode.trim() || undefined,
          phone: f.phone.trim() || undefined,
          email: f.email.trim() || undefined,
          clientType: f.clientType,
          notes: f.notes.trim() || undefined,
          createdAt: now,
          updatedAt: now
        };
        await db.clients.add(row);
        scheduleWorkflowSync();
        toast({
          title: t("clients.form.toasts.savedTitle"),
          description: t("clients.form.toasts.savedBody")
        });
        onOpenChange(false);
        onSaved?.();
        return;
      }
      if (!clientId) return;
      const prev = await db.clients.get(clientId);
      if (!prev) {
        toast({ title: t("clients.form.toasts.missingClientTitle"), variant: "destructive" });
        return;
      }
      const row: Client = {
        ...prev,
        name,
        contactPerson: f.contactPerson.trim() || undefined,
        address: f.address.trim() || undefined,
        city: f.city.trim() || undefined,
        postalCode: f.postalCode.trim() || undefined,
        phone: f.phone.trim() || undefined,
        email: f.email.trim() || undefined,
        clientType: f.clientType,
        notes: f.notes.trim() || undefined,
        updatedAt: now
      };
      await db.clients.put(row);
      scheduleWorkflowSync();
      toast({
        title: t("clients.form.toasts.updatedTitle"),
        description: t("clients.form.toasts.updatedBody")
      });
      onOpenChange(false);
      onSaved?.();
    } catch (e: unknown) {
      toast({
        title: t("clients.form.toasts.saveFailedTitle"),
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (mode !== "edit" || !clientId) return;
    setDeleting(true);
    try {
      const ivCount = await db.interventions.where("clientId").equals(clientId).count();
      if (ivCount > 0) {
        toast({
          title: t("clients.form.toasts.cannotDeleteTitle"),
          description: t("clients.form.toasts.cannotDeleteBody", { count: ivCount }),
          variant: "destructive"
        });
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user }
      } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
      const result = await performClientCloudSyncDelete({
        clientId,
        supabase: supabase ?? null,
        userId: user?.id ?? null
      });
      if (!result.ok) {
        toast({
          title: t("clients.form.toasts.deleteFailedTitle"),
          description: result.message,
          variant: "destructive"
        });
        return;
      }
      scheduleWorkflowSync();
      toast({
        title:
          result.mode === "queued"
            ? t("clients.form.toasts.deletedQueuedTitle")
            : t("clients.form.toasts.deletedTitle"),
        description:
          result.mode === "queued"
            ? t("clients.form.toasts.deletedQueuedBody")
            : t("clients.form.toasts.deletedBody")
      });
      onOpenChange(false);
      onSaved?.();
    } catch (e: unknown) {
      toast({
        title: t("clients.form.toasts.deleteFailedTitle"),
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive"
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "new" ? t("clients.form.titleNew") : t("clients.form.titleEdit")}</DialogTitle>
          <DialogDescription>
            {t("clients.form.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="cf-name">{t("clients.form.fields.name")}</Label>
            <Input
              id="cf-name"
              value={f.name}
              onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))}
              placeholder={t("clients.form.placeholders.name")}
              className="min-h-12 text-base"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
            <div className="grid gap-2">
              <Label htmlFor="cf-type">{t("clients.form.fields.type")}</Label>
              <select
                id="cf-type"
                className="min-h-12 w-full rounded-xl border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                value={f.clientType}
                onChange={(e) =>
                  setF((s) => ({ ...s, clientType: e.target.value as ClientType }))
                }
              >
                {CLIENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {clientTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cf-contact">{t("clients.form.fields.contactPerson")}</Label>
              <Input
                id="cf-contact"
                value={f.contactPerson}
                onChange={(e) => setF((s) => ({ ...s, contactPerson: e.target.value }))}
                placeholder={t("clients.form.placeholders.contactPerson")}
                className="min-h-12 text-base"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cf-address">{t("clients.form.fields.address")}</Label>
            <Input
              id="cf-address"
              value={f.address}
              onChange={(e) => setF((s) => ({ ...s, address: e.target.value }))}
              className="min-h-12 text-base"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
            <div className="grid gap-2">
              <Label htmlFor="cf-city">{t("clients.form.fields.city")}</Label>
              <Input
                id="cf-city"
                value={f.city}
                onChange={(e) => setF((s) => ({ ...s, city: e.target.value }))}
                className="min-h-12 text-base"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cf-cap">{t("clients.form.fields.postalCode")}</Label>
              <Input
                id="cf-cap"
                value={f.postalCode}
                onChange={(e) => setF((s) => ({ ...s, postalCode: e.target.value }))}
                className="min-h-12 text-base"
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
            <div className="grid gap-2">
              <Label htmlFor="cf-phone">{t("clients.form.fields.phone")}</Label>
              <Input
                id="cf-phone"
                type="tel"
                inputMode="tel"
                value={f.phone}
                onChange={(e) => setF((s) => ({ ...s, phone: e.target.value }))}
                className="min-h-12 text-base"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cf-email">{t("clients.form.fields.email")}</Label>
              <Input
                id="cf-email"
                type="email"
                inputMode="email"
                value={f.email}
                onChange={(e) => setF((s) => ({ ...s, email: e.target.value }))}
                className="min-h-12 text-base"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cf-notes">{t("clients.form.fields.notes")}</Label>
            <Textarea
              id="cf-notes"
              value={f.notes}
              onChange={(e) => setF((s) => ({ ...s, notes: e.target.value }))}
              rows={3}
              className="min-h-[5rem] resize-y text-base"
            />
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {mode === "edit" && clientId ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full border-destructive/40 text-destructive hover:bg-destructive/10 sm:w-auto"
              disabled={deleting || saving}
              onClick={() => setConfirmDeleteOpen(true)}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {deleting ? t("common.deleting") : t("common.delete")}
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="button" className="min-h-12 w-full sm:w-auto" disabled={saving} onClick={() => void save()}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("clients.form.deleteDialog.title")}</DialogTitle>
          <DialogDescription>{t("clients.form.deleteDialog.body", { name: f.name })}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={deleting} onClick={() => setConfirmDeleteOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            className="gap-2"
            onClick={() => { setConfirmDeleteOpen(false); void remove(); }}
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            {deleting ? t("common.deleting") : t("common.delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
