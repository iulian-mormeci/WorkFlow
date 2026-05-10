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
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTo(getSupportEmailTo());
    setNote("");
    (async () => {
      const d = await db.documents.get(doc);
      if (!d) return;
      setTitle(d.title);
      setAttachmentId(d.attachmentId);
    })();
  }, [open, doc]);

  const canSend = useMemo(() => {
    return to.trim().includes("@") && title.trim().length > 0 && Boolean(attachmentId);
  }, [to, title, attachmentId]);

  async function sendDirect() {
    const email = to.trim();
    console.info("[SendDocument] starting send to", email, { documentId, attachmentId, title });

    const a = await db.attachments.get(attachmentId);
    if (!a) throw new Error("PDF attachment not found");

    const fd = new FormData();
    fd.append("to", email);
    fd.append("title", title.trim());
    if (note.trim()) fd.append("note", note.trim());
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
          title: title.trim(),
          note: note.trim() || undefined,
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
          <DialogTitle>Send to Support</DialogTitle>
          <DialogDescription>
            Review details before sending. If you’re offline, we’ll queue it and send later.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-3">
          <div className="grid gap-2">
            <Label>To</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onBlur={() => setSupportEmailTo(to.trim())}
              placeholder="support@company.com"
              inputMode="email"
            />
            {interventionRef ? (
              <div className="text-xs text-muted-foreground">Intervention: {interventionRef}</div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>Document</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="text-xs text-muted-foreground">
              PDF will be attached automatically.
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Message / note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short context for support…" />
          </div>

          {!online ? (
            <div className="rounded-2xl border bg-muted p-4 text-sm text-muted-foreground">
              Offline: this email will be queued and sent automatically when you’re back online.
            </div>
          ) : null}

          <div className="mt-2 flex items-center justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!canSend || sending} type="button" onClick={sendOrQueue}>
              {sending ? "Processing…" : online ? "Send" : "Queue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

