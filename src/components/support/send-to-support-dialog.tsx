"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db/workflow-db";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useToast } from "@/hooks/use-toast";
import { getSupportEmailTo, setSupportEmailTo } from "@/lib/support-email/config";
import { flushSupportEmailOutbox, queueSupportEmail } from "@/lib/support-email/send";
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
import { useTranslations } from "next-intl";

export function SendToSupportDialog({
  open,
  onOpenChange,
  documentId,
  interventionRef
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  documentId: string;
  interventionRef?: string;
}) {
  const t = useTranslations();
  const { toast } = useToast();
  const online = useOnlineStatus();

  const doc = useMemo(() => documentId, [documentId]);
  // We’ll read from Dexie in an effect for simplicity.
  const [title, setTitle] = useState("");
  const [attachmentId, setAttachmentId] = useState<string>("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTo(getSupportEmailTo());
    setMessage("");
    (async () => {
      const d = await db.documents.get(doc);
      if (!d) return;
      setTitle(d.title);
      setAttachmentId(d.attachmentId);
      setSubject(t("support.send.subjectDefault", { title: d.title }));
    })();
  }, [open, doc, t]);

  const canSend = useMemo(() => {
    return to.trim().includes("@") && title.trim().length > 0 && Boolean(attachmentId);
  }, [to, title, attachmentId]);

  async function sendDirect() {
    const email = to.trim();
    const a = await db.attachments.get(attachmentId);
    if (!a) throw new Error(t("support.send.errors.attachmentNotFound"));

    const fd = new FormData();
    fd.append("to", email);
    fd.append("subject", subject.trim() || t("support.send.subjectDefault", { title: title.trim() }));
    fd.append("title", title.trim());
    if (message.trim()) fd.append("message", message.trim());
    fd.append("file", new File([a.blob], a.name ?? "document.pdf", { type: "application/pdf" }));

    const res = await fetch("/api/support-email", { method: "POST", body: fd });
    if (!res.ok) throw new Error(await res.text());
  }

  async function sendOrQueue() {
    if (!canSend) return;
    setSending(true);
    try {
      // Persist last-used recipient for next time (user can override per send).
      setSupportEmailTo(to.trim());
      if (!online) {
        const outboxId = crypto.randomUUID();
        await queueSupportEmail({
          id: outboxId,
          to: to.trim(),
          title: subject.trim() || title.trim(),
          note: message.trim() || undefined,
          documentId,
          attachmentId,
          interventionId: undefined,
          lastError: undefined
        });
        toast({
          title: t("support.send.toasts.queuedTitle"),
          description: t("support.send.toasts.queuedBody")
        });
        onOpenChange(false);
        return;
      }

      // Online: send immediately with direct fetch (strong debug visibility).
      try {
        await sendDirect();
      } catch (e) {
        toast({
          title: t("support.send.toasts.sendFailedTitle"),
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive"
        });
        return;
      }

      try {
        await flushSupportEmailOutbox();
      } catch { /* best-effort */ }
      toast({
        title: t("support.send.toasts.sentTitle"),
        description: t("support.send.toasts.sentBody")
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: t("support.send.toasts.sendFailedTitle"),
        description: e?.message ?? t("support.send.toasts.sendFailedBodyFallback"),
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("support.send.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("support.send.dialogBody")}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <Label>{t("support.send.toLabel")}</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onBlur={() => setSupportEmailTo(to.trim())}
              placeholder={t("support.send.toPlaceholder")}
              inputMode="email"
              className="min-h-12 touch-manipulation text-base"
            />
            {interventionRef ? (
              <div className="text-xs text-muted-foreground">
                {t("support.send.interventionRef", { ref: interventionRef })}
              </div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>{t("support.send.subjectLabel")}</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("support.send.subjectDefault", { title })}
              className="min-h-12 touch-manipulation text-base"
            />
            <div className="text-xs text-muted-foreground">
              {t("support.send.subjectHint")}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>{t("support.send.messageLabel")}</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("support.send.messagePlaceholder")}
              className="min-h-28 text-base"
            />
          </div>

          {!online ? (
            <div className="rounded-2xl border bg-muted p-4 text-sm text-muted-foreground">
              {t("support.send.offlineHint")}
            </div>
          ) : null}

          <div className="mt-2 flex items-center justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!canSend || sending} type="button" onClick={sendOrQueue}>
              {sending
                ? t("support.send.actions.sending")
                : online
                  ? t("support.send.actions.send")
                  : t("support.send.actions.queue")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

