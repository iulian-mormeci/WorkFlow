"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, FileText, Images, Pencil, Send, Trash2 } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { deleteDocumentRemote } from "@/lib/sync/cloud-delete";
import { SendToSupportDialog } from "@/components/support/send-to-support-dialog";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DocumentDetailClient({ id }: { id: string }) {
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();
  const doc = useLiveQuery(async () => await db.documents.get(id), [id, liveEpoch]);
  const attachment = useLiveQuery(
    async () => (doc ? await db.attachments.get(doc.attachmentId) : null),
    [doc?.attachmentId, liveEpoch]
  );

  const [rename, setRename] = useState(false);
  const [title, setTitle] = useState("");
  const [sendOpen, setSendOpen] = useState(false);

  useEffect(() => {
    if (doc) setTitle(doc.title);
  }, [doc]);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!attachment?.blob) return;
    const u = URL.createObjectURL(attachment.blob);
    setPdfUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [attachment?.blob]);

  // thumbnails
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState<number>(0);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [activePage, setActivePage] = useState(1);

  useEffect(() => {
    (async () => {
      if (!attachment?.blob) return;
      setThumbs([]);
      setPageCount(0);

      const pdfjs: any = await import("pdfjs-dist");
      // bundle worker
      (pdfjs as any).GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();

      const bytes = new Uint8Array(await attachment.blob.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      setPageCount(pdf.numPages);

      const urls: string[] = [];
      for (let p = 1; p <= Math.min(pdf.numPages, 12); p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 0.25 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({ canvasContext: ctx as any, viewport }).promise;
        urls.push(canvas.toDataURL("image/jpeg", 0.85));
      }
      setThumbs(urls);
    })().catch((e) =>
      toast({ title: "PDF preview failed", description: String(e), variant: "destructive" })
    );
  }, [attachment?.blob, toast]);

  if (doc === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <Skeleton className="h-[420px] rounded-2xl" />
          <Skeleton className="h-[420px] rounded-2xl" />
        </div>
      </div>
    );
  }
  if (!doc) {
    return (
      <div className="space-y-4">
        <Link className="inline-flex items-center gap-2 text-sm underline" href="/documents">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="rounded-2xl border bg-muted p-4 text-sm text-muted-foreground">
          Document not found.
        </div>
      </div>
    );
  }

  // Allow opening the send dialog even when offline (it can queue).
  const canOpenSend = true;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Link className="inline-flex items-center gap-2 text-sm underline" href="/documents">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{doc.title}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(doc.createdAt).toLocaleString()} • {doc.pageCount} pages
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setRename((v) => !v)}>
            <Pencil className="h-4 w-4" />
            Rename
          </Button>
          <Button
            variant="outline"
            disabled={!pdfUrl}
            onClick={() => pdfUrl && window.open(pdfUrl, "_blank", "noopener,noreferrer")}
          >
            <FileText className="h-4 w-4" />
            Open
          </Button>
          <Button
            variant="outline"
            disabled={!canOpenSend}
            onClick={() => {
              console.info("[SendDocument] open send dialog", { documentId: doc.id });
              setSendOpen(true);
            }}
          >
            <Send className="h-4 w-4" />
            Send
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (
                !confirm(
                  "Delete this document from this device and from the cloud (when online)?"
                )
              ) {
                return;
              }
              try {
                const supabase = createSupabaseBrowserClient();
                const {
                  data: { user }
                } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
                if (supabase && user && typeof navigator !== "undefined" && navigator.onLine) {
                  await deleteDocumentRemote(supabase, user.id, {
                    documentId: doc.id,
                    attachmentId: doc.attachmentId,
                    interventionId: doc.interventionId ?? null
                  });
                }
                if (doc.interventionId) {
                  const it = await db.interventions.get(doc.interventionId);
                  const next = (it?.documentIds ?? []).filter((x) => x !== doc.id);
                  await db.interventions.update(doc.interventionId, {
                    documentIds: next,
                    updatedAt: new Date().toISOString()
                  });
                }
                await db.attachments.delete(doc.attachmentId);
                await db.documents.delete(doc.id);
                toast({ title: "Deleted", description: "Document removed." });
                window.location.href = "/documents";
              } catch (e: any) {
                toast({
                  title: "Delete failed",
                  description: e?.message ?? "Could not delete",
                  variant: "destructive"
                });
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </header>

      {rename ? (
        <Card className="rounded-2xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">Rename</CardTitle>
            <CardDescription>Keep titles consistent for quick search.</CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  const next = title.trim();
                  if (!next) return;
                  await db.documents.update(doc.id, { title: next });
                  toast({ title: "Renamed", description: "Document title updated." });
                  setRename(false);
                }}
              >
                Save
              </Button>
              <Button variant="outline" onClick={() => setRename(false)}>
                Cancel
              </Button>
            </div>
          </div>
          <div className="h-5" />
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-2xl border bg-background p-3">
          <div className="text-xs text-muted-foreground">
            Pages {pageCount ? `(${pageCount})` : ""}
          </div>
          <div className="mt-3 grid gap-2">
            {thumbs.length ? (
              thumbs.map((u, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={[
                    "overflow-hidden rounded-xl border bg-muted p-2 text-left",
                    activePage === idx + 1 ? "ring-2 ring-primary/30" : ""
                  ].join(" ")}
                  onClick={() => setActivePage(idx + 1)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`Page ${idx + 1}`} className="w-full rounded-lg" />
                  <div className="mt-2 text-xs text-muted-foreground">Page {idx + 1}</div>
                </button>
              ))
            ) : (
              <div className="rounded-xl border bg-muted px-3 py-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Images className="h-4 w-4" />
                  Generating thumbnails…
                </div>
              </div>
            )}
          </div>
        </aside>

        <section className="rounded-2xl border bg-background p-3">
          {pdfUrl ? (
            <div
              ref={viewerRef}
              className="h-[60dvh] overflow-hidden rounded-xl border bg-black sm:h-[70dvh]"
            >
              <iframe
                title="PDF viewer"
                src={`${pdfUrl}#page=${activePage}&zoom=page-width`}
                className="h-full w-full"
              />
            </div>
          ) : (
            <div className="rounded-xl border bg-muted px-3 py-6 text-sm text-muted-foreground">
              PDF not ready yet.
            </div>
          )}
        </section>
      </div>

      <SendToSupportDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        documentId={doc.id}
      />
    </div>
  );
}

