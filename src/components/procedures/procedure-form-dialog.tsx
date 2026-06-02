"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  PROCEDURE_CATEGORIES,
  db,
  type Procedure,
  type ProcedureCategory
} from "@/lib/db/workflow-db";
import {
  createProcedure,
  parseTagsInput,
  updateProcedure,
  type ProcedureFormValues
} from "@/lib/procedures/procedure-mutations";
import { createProcedureImageAttachment } from "@/lib/procedures/image-attachment";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { performStandaloneAttachmentCloudDelete } from "@/lib/sync/cloud-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  ProcedureEditor,
  type ProcedureEditorImage
} from "@/components/procedures/procedure-editor";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Provide to edit; omit/null to create. */
  procedure?: Procedure | null;
  /** Prefill brand/model from active filters when creating. */
  defaults?: { brand?: string; model?: string };
  onSaved?: () => void;
};

export function ProcedureFormDialog({
  open,
  onOpenChange,
  procedure,
  defaults,
  onSaved
}: Props) {
  const t = useTranslations();
  const { toast } = useToast();
  const isEdit = Boolean(procedure);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ProcedureCategory>("general");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seedKey, setSeedKey] = useState("new");

  // Attachments created in this editing session (cleaned up if the dialog is dismissed unsaved).
  const sessionAddedRef = useRef<Set<string>>(new Set());
  // Original images removed during edit (deleted from cloud only on save).
  const removedExistingRef = useRef<Set<string>>(new Set());
  const savedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    savedRef.current = false;
    sessionAddedRef.current = new Set();
    removedExistingRef.current = new Set();
    setTitle(procedure?.title ?? "");
    setCategory(procedure?.category ?? (defaults?.brand || defaults?.model ? "brand_model" : "general"));
    setBrand(procedure?.brand ?? defaults?.brand ?? "");
    setModel(procedure?.model ?? defaults?.model ?? "");
    setContent(procedure?.content ?? "");
    setTagsInput((procedure?.tags ?? []).join(", "));
    setImageIds(procedure?.imageIds ?? []);
    setUploading(false);
    setSaving(false);
    setSeedKey(procedure?.id ?? `new-${Date.now()}`);
  }, [open, procedure, defaults]);

  // Resolve object URLs for the working image set.
  const attachments = useLiveQuery(async () => {
    if (!imageIds.length) return [];
    const rows = await db.attachments.bulkGet(imageIds);
    return rows.filter(Boolean);
  }, [imageIds]);

  const [previews, setPreviews] = useState<ProcedureEditorImage[]>([]);
  useEffect(() => {
    const byId = new Map<string, string>();
    for (const a of attachments ?? []) {
      if (a?.blob) byId.set(a.id, URL.createObjectURL(a.blob));
    }
    // Keep ordering aligned with imageIds.
    const ordered: ProcedureEditorImage[] = [];
    for (const id of imageIds) {
      const url = byId.get(id);
      if (url) ordered.push({ id, url });
    }
    setPreviews(ordered);
    return () => {
      for (const url of byId.values()) URL.revokeObjectURL(url);
    };
  }, [attachments, imageIds]);

  const canSave = useMemo(() => title.trim().length > 1, [title]);

  async function handlePickFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const newIds: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const id = await createProcedureImageAttachment(file);
        sessionAddedRef.current.add(id);
        newIds.push(id);
      }
      if (newIds.length) setImageIds((prev) => [...prev, ...newIds]);
    } catch (e) {
      toast({
        title: t("procedures.toasts.imageFailedTitle"),
        description: e instanceof Error ? e.message : t("common.unknownError"),
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveImage(id: string) {
    setImageIds((prev) => prev.filter((x) => x !== id));
    if (sessionAddedRef.current.has(id)) {
      // Unsaved upload — delete it right away (it is not referenced anywhere yet).
      sessionAddedRef.current.delete(id);
      try {
        const supabase = createSupabaseBrowserClient();
        await performStandaloneAttachmentCloudDelete({ attachmentId: id, supabase, userId: null });
      } catch {
        /* best-effort */
      }
    } else {
      // Existing image — defer cloud delete until the procedure is saved.
      removedExistingRef.current.add(id);
    }
  }

  async function cleanupUnsaved() {
    const ids = [...sessionAddedRef.current];
    sessionAddedRef.current = new Set();
    if (!ids.length) return;
    try {
      const supabase = createSupabaseBrowserClient();
      for (const id of ids) {
        await performStandaloneAttachmentCloudDelete({ attachmentId: id, supabase, userId: null });
      }
    } catch {
      /* best-effort */
    }
  }

  function requestClose(next: boolean) {
    if (!next && !savedRef.current) {
      void cleanupUnsaved();
    }
    onOpenChange(next);
  }

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    const values: ProcedureFormValues = {
      title,
      category,
      brand,
      model,
      content,
      tags: parseTagsInput(tagsInput),
      imageIds
    };
    try {
      if (procedure) {
        await updateProcedure(procedure, values);
      } else {
        await createProcedure(values);
      }
      savedRef.current = true;

      // Now that the procedure is saved, drop images the user removed during edit.
      const removed = [...removedExistingRef.current];
      removedExistingRef.current = new Set();
      if (removed.length) {
        const supabase = createSupabaseBrowserClient();
        for (const id of removed) {
          await performStandaloneAttachmentCloudDelete({ attachmentId: id, supabase, userId: null });
        }
      }

      toast({
        title: isEdit
          ? t("procedures.toasts.updatedTitle")
          : t("procedures.toasts.createdTitle"),
        description: t("procedures.toasts.savedLocally")
      });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: t("procedures.toasts.saveFailedTitle"),
        description: e instanceof Error ? e.message : t("common.unknownError"),
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("procedures.form.editTitle") : t("procedures.form.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("procedures.form.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <Label>{t("procedures.fields.title")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("procedures.fields.titlePlaceholder")}
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label>{t("procedures.fields.category")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {PROCEDURE_CATEGORIES.map((c) => (
                <Button
                  key={c}
                  type="button"
                  variant={category === c ? "default" : "outline"}
                  onClick={() => setCategory(c)}
                >
                  {t(`procedures.categories.${c}`)}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("procedures.fields.brand")}</Label>
              <Input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder={t("procedures.fields.brandPlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("procedures.fields.model")}</Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={t("procedures.fields.modelPlaceholder")}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>{t("procedures.fields.content")}</Label>
            <ProcedureEditor
              seedKey={seedKey}
              seedHtml={content}
              onChange={setContent}
              images={previews}
              onPickFiles={handlePickFiles}
              onRemoveImage={handleRemoveImage}
              busy={uploading}
            />
          </div>

          <div className="grid gap-2">
            <Label>{t("procedures.fields.tags")}</Label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={t("procedures.fields.tagsPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">{t("procedures.fields.tagsHint")}</p>
          </div>

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => requestClose(false)} disabled={saving}>
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
