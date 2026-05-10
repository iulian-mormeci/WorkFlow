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
      setSubject(`Documento WorkFlow - ${d.title}`);
    })();
  }, [open, doc]);

  const canSend = useMemo(() => {
    return to.trim().includes("@") && title.trim().length > 0 && Boolean(attachmentId);
  }, [to, title, attachmentId]);

  async function sendDirect() {
    const email = to.trim();
    console.info("[SendDocument] starting send to", email, { documentId, attachmentId, subject });

    const a = await db.attachments.get(attachmentId);
    if (!a) throw new Error("PDF attachment not found");

    const fd = new FormData();
    fd.append("to", email);
    fd.append("subject", subject.trim() || `Documento WorkFlow - ${title.trim()}`);
    fd.append("title", title.trim());
    if (message.trim()) fd.append("message", message.trim());
    fd.append("file", new File([a.blob], a.name ?? "document.pdf", { type: "application/pdf" }));

    console.info("[SendDocument] POST /api/support-email (fetch start)");
    const res = await fetch("/api/support-email", { method: "POST", body: fd });
    console.info("[SendDocument] POST /api/support-email (fetch done)", { ok: res.ok, status: res.status });
    if (!res.ok) throw new Error(await res.text());
  }

  async function sendOrQueue() {
    if (!canSend) return;
    setSending(true);
    try {
      // Persist last-used recipient for next time (user can override per send).
      setSupportEmailTo(to.trim());
      if (!online) {
        console.info("[SendDocument] offline; queueing email", { to: to.trim(), documentId });
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
        toast({ title: "Queued", description: "Will send automatically when online." });
        onOpenChange(false);
        return;
      }

      // Online: send immediately with direct fetch (strong debug visibility).
      try {
        await sendDirect();
      } catch (e) {
        console.error("[SendDocument] failed", e);
        toast({
          title: "Send failed",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive"
        });
        return;
      }

      // Also flush any queued items (best-effort).
      try {
        console.info("[SendDocument] flushing outbox…");
        await flushSupportEmailOutbox();
        console.info("[SendDocument] flush complete");
      } catch (e) {
        console.error("[SendDocument] flush failed", e);
      }
      toast({ title: "Sent", description: "Document emailed to support." });
      onOpenChange(false);
    } catch (e: any) {
      console.error("[SendDocument] failed", e);
      toast({
        title: "Send failed",
        description: e?.message ?? "Could not send",
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
          <DialogTitle>Invia documento</DialogTitle>
          <DialogDescription>
            Controlla i dettagli prima di inviare. Se sei offline, lo mettiamo in coda e lo inviamo appena torni online.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <Label>To</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onBlur={() => setSupportEmailTo(to.trim())}
              placeholder="support@company.com"
              inputMode="email"
              className="min-h-12 touch-manipulation text-base"
            />
            {interventionRef ? (
              <div className="text-xs text-muted-foreground">Intervention: {interventionRef}</div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>Oggetto</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={`Documento WorkFlow - ${title}`}
              className="min-h-12 touch-manipulation text-base"
            />
            <div className="text-xs text-muted-foreground">
              Il PDF verrà allegato automaticamente.
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Messaggio personalizzato (opzionale)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Scrivi qui eventuali dettagli…"
              className="min-h-28 text-base"
            />
          </div>

          {!online ? (
            <div className="rounded-2xl border bg-muted p-4 text-sm text-muted-foreground">
              Offline: this email will be queued and sent automatically when you’re back online.
            </div>
          ) : null}

          <div className="mt-2 flex items-center justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button disabled={!canSend || sending} type="button" onClick={sendOrQueue}>
              {sending ? "Invio…" : online ? "Invia" : "Metti in coda"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

