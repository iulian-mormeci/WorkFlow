"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, Tag, X } from "lucide-react";
import { db, type Procedure } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useTranslations } from "next-intl";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  procedure: Procedure | null;
  onEdit?: (procedure: Procedure) => void;
};

export function ProcedureViewDialog({ open, onOpenChange, procedure, onEdit }: Props) {
  const t = useTranslations();
  const imageIds = procedure?.imageIds ?? [];

  const attachments = useLiveQuery(async () => {
    if (!open || !imageIds.length) return [];
    const rows = await db.attachments.bulkGet(imageIds);
    return rows.filter(Boolean);
  }, [open, imageIds.join(",")]);

  const [images, setImages] = useState<{ id: string; url: string }[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);

  // `bulkGet` preserves the order of the requested ids, so `attachments` is already ordered.
  useEffect(() => {
    const ordered: { id: string; url: string }[] = [];
    for (const a of attachments ?? []) {
      if (a?.blob) ordered.push({ id: a.id, url: URL.createObjectURL(a.blob) });
    }
    setImages(ordered);
    return () => {
      for (const img of ordered) URL.revokeObjectURL(img.url);
    };
  }, [attachments]);

  if (!procedure) return null;

  const subtitleParts = [
    t(`procedures.categories.${procedure.category}`),
    procedure.brand,
    procedure.model
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{procedure.title}</DialogTitle>
          <DialogDescription>{subtitleParts.join(" · ")}</DialogDescription>
        </DialogHeader>

        <div className="mt-3 space-y-4">
          {procedure.tags?.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {procedure.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  <Tag className="h-3 w-3" />
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {procedure.content ? (
            <div
              className="procedure-prose text-sm leading-relaxed"
              // Content is sanitized on write (sanitizeProcedureHtml).
              dangerouslySetInnerHTML={{ __html: procedure.content }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("procedures.view.noContent")}</p>
          )}

          {images.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setZoom(img.url)}
                  className="aspect-square overflow-hidden rounded-lg border bg-muted transition-transform active:scale-[0.98]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </Button>
            {onEdit ? (
              <Button type="button" onClick={() => onEdit(procedure)}>
                <Pencil className="h-4 w-4" />
                {t("common.edit")}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>

      {zoom ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setZoom(null)}
        >
          <button
            type="button"
            aria-label={t("common.close")}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
            onClick={() => setZoom(null)}
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      ) : null}
    </Dialog>
  );
}
