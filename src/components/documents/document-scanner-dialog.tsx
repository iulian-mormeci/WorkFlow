"use client";

import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { db } from "@/lib/db/workflow-db";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { persistAttachmentToCloud } from "@/lib/sync/attachment-cloud";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function enhanceToJpegDataUrl(dataUrl: string, quality = 0.92) {
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("WF_IMAGE_LOAD_FAILED"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("WF_CANVAS_NOT_SUPPORTED");

  // Stronger “scanner-like” enhancement using canvas filters.
  // (fast enough for iPad, works offline)
  ctx.filter = "contrast(1.35) brightness(1.08) saturate(0.9)";
  ctx.drawImage(img, 0, 0);
  ctx.filter = "none";

  return canvas.toDataURL("image/jpeg", quality);
}

type PageItem = {
  id: string;
  file: File;
  rotation: 0 | 90 | 180 | 270;
  originalUrl: string;
  enhancedUrl?: string;
};

export function DocumentScannerDialog({
  open,
  onOpenChange,
  interventionId,
  defaultTitle
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  interventionId?: string;
  defaultTitle: string;
}) {
  const t = useTranslations();
  const { toast } = useToast();
  const [title, setTitle] = useState(defaultTitle);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [enhance, setEnhance] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const canSave = useMemo(
    () => title.trim().length > 2 && pages.length > 0,
    [title, pages.length]
  );

  useEffect(() => {
    // cleanup object URLs
    return () => {
      pages.forEach((p) => URL.revokeObjectURL(p.originalUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
  }, [open, defaultTitle]);

  async function addFiles(files: File[]) {
    if (!files.length) return;
    setAdding(true);
    try {
      const items: PageItem[] = [];
      for (const f of files) {
        const originalUrl = URL.createObjectURL(f);
        const it: PageItem = {
          id: crypto.randomUUID(),
          file: f,
          rotation: 0,
          originalUrl
        };
        if (enhance) {
          try {
            const raw = await fileToDataUrl(f);
            it.enhancedUrl = await enhanceToJpegDataUrl(raw);
          } catch {
            // ignore enhancement errors; still keep the page
          }
        }
        items.push(it);
      }
      setPages((s) => [...s, ...items]);
    } finally {
      setAdding(false);
    }
  }

  function removePage(id: string) {
    setPages((s) => {
      const p = s.find((x) => x.id === id);
      if (p) URL.revokeObjectURL(p.originalUrl);
      return s.filter((x) => x.id !== id);
    });
  }

  function move(id: string, dir: -1 | 1) {
    setPages((s) => {
      const idx = s.findIndex((x) => x.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= s.length) return s;
      const copy = [...s];
      const tmp = copy[idx]!;
      copy[idx] = copy[next]!;
      copy[next] = tmp;
      return copy;
    });
  }

  function rotate(id: string) {
    setPages((s) =>
      s.map((p) =>
        p.id === id
          ? ({ ...p, rotation: (((p.rotation + 90) % 360) as any) } as PageItem)
          : p
      )
    );
  }

  async function getProcessedDataUrl(p: PageItem) {
    const raw = await fileToDataUrl(p.file);
    const imgData = enhance ? (p.enhancedUrl ?? (await enhanceToJpegDataUrl(raw))) : raw;

    if (p.rotation === 0) return imgData;

    // rotate via canvas
    const img = new Image();
    img.src = imgData;
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("WF_IMAGE_LOAD_FAILED"));
    });
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (!ctx) return imgData;

    const rot = p.rotation;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (rot === 90 || rot === 270) {
      c.width = h;
      c.height = w;
    } else {
      c.width = w;
      c.height = h;
    }
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2);
    return c.toDataURL("image/jpeg", 0.92);
  }

  async function savePdf() {
    setSaving(true);
    try {
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage();
        const imgData = await getProcessedDataUrl(pages[i]!);

        // Fit image to page with margins
        const margin = 28;
        const img = new Image();
        img.src = imgData;
        await new Promise<void>((res) => (img.onload = () => res()));
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const maxW = pageW - margin * 2;
        const maxH = pageH - margin * 2;
        const scale = Math.min(maxW / iw, maxH / ih);
        const w = iw * scale;
        const h = ih * scale;
        const x = (pageW - w) / 2;
        const y = (pageH - h) / 2;

        pdf.addImage(imgData, "JPEG", x, y, w, h);
      }

      const blob = pdf.output("blob") as Blob;
      const nowIso = new Date().toISOString();
      const attachmentId = crypto.randomUUID();
      const docId = crypto.randomUUID();

      const pdfName = `${title.trim().replaceAll(/[^\w\- ]+/g, "").slice(0, 48)}.pdf`;

      await db.attachments.add({
        id: attachmentId,
        kind: "document",
        mime: "application/pdf",
        name: pdfName,
        size: blob.size,
        blob,
        createdAt: nowIso
      });

      setUploadPct(0);
      try {
        const supabase = createSupabaseBrowserClient();
        if (supabase && navigator.onLine) {
          const {
            data: { user }
          } = await supabase.auth.getUser();
          if (user) {
            const att = await db.attachments.get(attachmentId);
            if (att) {
              await persistAttachmentToCloud(supabase, user.id, att, {
                onProgress: (p) => setUploadPct(p)
              });
            }
          }
        }
      } catch (e: unknown) {
        toast({
          title: t("scanner.toasts.cloudUploadIncompleteTitle"),
          description:
            e instanceof Error ? e.message : t("scanner.toasts.cloudUploadIncompleteBodyFallback"),
          variant: "destructive"
        });
      } finally {
        setUploadPct(null);
      }

      await db.documents.add({
        id: docId,
        interventionId,
        title: title.trim(),
        attachmentId,
        pageCount: pages.length,
        createdAt: nowIso
      });

      if (interventionId) {
        const it = await db.interventions.get(interventionId);
        const prev = it?.documentIds ?? [];
        await db.interventions.update(interventionId, {
          documentIds: [...prev, docId],
          updatedAt: nowIso
        });
      }

      scheduleWorkflowSync();
      toast({
        title: t("scanner.toasts.savedTitle"),
        description: t("scanner.toasts.savedBody")
      });
      setPages([]);
      onOpenChange(false);
    } catch (e: any) {
      const rawMsg = e?.message ? String(e.message) : "";
      const mappedMsg =
        rawMsg === "WF_IMAGE_LOAD_FAILED"
          ? t("scanner.errors.imageLoadFailed")
          : rawMsg === "WF_CANVAS_NOT_SUPPORTED"
            ? t("scanner.errors.canvasNotSupported")
            : rawMsg;
      toast({
        title: t("scanner.toasts.scanFailedTitle"),
        description: mappedMsg || t("scanner.toasts.scanFailedBodyFallback"),
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("scanner.title")}</DialogTitle>
          <DialogDescription>
            {t("scanner.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <Label>{t("scanner.fields.title")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>{t("scanner.fields.pages")}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("scanner.add.camera")}
                </span>
                <input
                  className="h-12 w-full rounded-xl border bg-background px-3 text-sm"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    void addFiles(files);
                    // allow selecting the same file again
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("scanner.add.library")}
                </span>
                <input
                  className="h-12 w-full rounded-xl border bg-background px-3 text-sm"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    void addFiles(files);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            <div className="text-xs text-muted-foreground">
              {t("scanner.add.hint")}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border bg-muted/60 px-4 py-3 text-sm">
            <Checkbox checked={enhance} onCheckedChange={(v) => setEnhance(Boolean(v))} />
            <div className="min-w-0">
              <div className="font-medium">{t("scanner.enhance.title")}</div>
              <div className="text-xs text-muted-foreground">
                {t("scanner.enhance.body")}
              </div>
            </div>
          </div>

          {pages.length ? (
            <div className="rounded-2xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">{t("scanner.pagesCount", { count: pages.length })}</div>
                <div className="text-xs text-muted-foreground">
                  {t("scanner.pagesHint")}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {pages.map((p, idx) => (
                  <div key={p.id} className="rounded-2xl border bg-background p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">
                        {t("scanner.pageLabel", { index: idx + 1 })}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          type="button"
                          className="min-h-11 touch-manipulation"
                          onClick={() => move(p.id, -1)}
                        >
                          {t("scanner.actions.up")}
                        </Button>
                        <Button
                          variant="outline"
                          type="button"
                          className="min-h-11 touch-manipulation"
                          onClick={() => move(p.id, 1)}
                        >
                          {t("scanner.actions.down")}
                        </Button>
                        <Button
                          variant="outline"
                          type="button"
                          className="min-h-11 touch-manipulation"
                          onClick={() => rotate(p.id)}
                        >
                          {t("scanner.actions.rotate")}
                        </Button>
                        <Button
                          variant="outline"
                          type="button"
                          className="min-h-11 touch-manipulation"
                          onClick={() => removePage(p.id)}
                        >
                          {t("common.delete")}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 overflow-hidden rounded-2xl border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={enhance ? (p.enhancedUrl ?? p.originalUrl) : p.originalUrl}
                        alt={t("scanner.previewAlt", { index: idx + 1 })}
                        className="h-48 w-full object-contain"
                        style={{ transform: `rotate(${p.rotation}deg)` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border bg-muted p-4 text-sm text-muted-foreground">
              {t("scanner.empty")}
            </div>
          )}

          {uploadPct != null ? (
            <div className="grid gap-1">
              <div className="text-xs font-medium text-muted-foreground">
                {t("scanner.uploading", { pct: uploadPct })}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-[width] duration-150"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!canSave || saving || adding} type="button" onClick={savePdf}>
              {adding
                ? t("scanner.actions.adding")
                : saving
                  ? uploadPct != null
                    ? t("scanner.actions.uploadPct", { pct: uploadPct })
                    : t("scanner.actions.saving")
                  : t("scanner.actions.savePdf")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

