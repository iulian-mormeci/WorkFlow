"use client";

import Link from "next/link";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FileScan, FileText, Plus, Search, Send } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { DocumentScannerDialog } from "@/components/documents/document-scanner-dialog";

async function openPdf(attachmentId: string) {
  const a = await db.attachments.get(attachmentId);
  if (!a) throw new Error("Attachment not found");
  const url = URL.createObjectURL(a.blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function sendToSupport(attachmentId: string, title: string) {
  const a = await db.attachments.get(attachmentId);
  if (!a) throw new Error("Attachment not found");
  const fd = new FormData();
  fd.append("title", title);
  fd.append("file", new File([a.blob], a.name ?? "document.pdf", { type: "application/pdf" }));
  const res = await fetch("/api/support-email", { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
}

export function DocumentsArchive() {
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();
  const [q, setQ] = useState("");
  const [scanOpen, setScanOpen] = useState(false);

  const docs = useLiveQuery(async () => {
    const all = await db.documents.orderBy("createdAt").reverse().toArray();
    const query = q.trim().toLowerCase();
    if (!query) return all;
    return all.filter((d) => d.title.toLowerCase().includes(query));
  }, [q, liveEpoch]);

  const canSend = typeof navigator !== "undefined" ? navigator.onLine : false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {docs?.length ?? 0} documents
        </div>
        <Button size="lg" className="min-h-12 touch-manipulation" onClick={() => setScanOpen(true)}>
          <Plus className="h-5 w-5" />
          Scan document
        </Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search documents…"
          className="min-h-12 pl-9 text-base"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b bg-muted px-4 py-3 text-sm font-medium">
          <div>Document</div>
          <div className="text-right">Actions</div>
        </div>
        <div className="divide-y">
          {(docs ?? []).map((d) => (
            <div key={d.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link href={`/documents/${d.id}`} className="truncate text-base font-semibold underline-offset-4 hover:underline">
                  {d.title}
                </Link>
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(d.createdAt).toLocaleString()} • {d.pageCount} page{d.pageCount === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  className="min-h-11 touch-manipulation"
                  onClick={() =>
                    openPdf(d.attachmentId).catch((e) =>
                      toast({ title: "Open failed", description: String(e), variant: "destructive" })
                    )
                  }
                >
                  <FileText className="h-4 w-4" />
                  Open
                </Button>
                <Button
                  variant="outline"
                  disabled={!canSend}
                  className="min-h-11 touch-manipulation"
                  onClick={() =>
                    sendToSupport(d.attachmentId, d.title)
                      .then(() => toast({ title: "Sent", description: "Emailed to support." }))
                      .catch((e) =>
                        toast({ title: "Send failed", description: String(e), variant: "destructive" })
                      )
                  }
                >
                  <Send className="h-4 w-4" />
                  Send
                </Button>
              </div>
            </div>
          ))}

          {(docs ?? []).length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border bg-muted/40">
                <FileScan className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="mt-4 text-sm font-semibold">No documents yet</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Scan your first document from an intervention (offline-first).
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {!canSend ? (
        <div className="rounded-2xl border bg-muted p-4 text-sm text-muted-foreground">
          You’re offline. “Send to Support” will be available when you’re online.
        </div>
      ) : null}

      <DocumentScannerDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        defaultTitle={`Scan - ${new Date().toLocaleDateString()}`}
      />
    </div>
  );
}

