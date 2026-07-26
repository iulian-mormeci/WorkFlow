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
import { submitProcedureForGlobal } from "@/lib/procedures/submit-global-procedure";
import { isGlobalProcedureAdmin } from "@/lib/procedures/global-procedure-admin";
import { WORK_SECTORS, type WorkSector } from "@/lib/account/sectors";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { performStandaloneAttachmentCloudDelete } from "@/lib/sync/cloud-delete";
import { useAuthStore } from "@/stores/auth";
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
import {
  ProcedureEditor,
  type ProcedureEditorImage
} from "@/components/procedures/procedure-editor";
import { Globe } from "lucide-react";
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
  const user = useAuthStore((s) => s.user);
  const isAdmin = isGlobalProcedureAdmin(user);
  const isEdit = Boolean(procedure);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ProcedureCategory>("general");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [submitGlobal, setSubmitGlobal] = useState(false);
  const [sectorTags, setSectorTags] = useState<WorkSector[]>([]);
  const [shareWithCompany, setShareWithCompany] = useState(false);
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seedKey, setSeedKey] = useState("new");

  // Attachments created in this editing session (cleaned up if the dialog is dismissed unsaved).
  const sessionAddedRef = useRef<Set<string>>(new Set());
  // Original images removed during edit (deleted from cloud only on save).
  const removedExistingRef = useRef<Set<string>>(new Set());
  const savedRef = useRef(false);

  // `procedure`/`defaults` are read through refs instead of the effect's deps below: the
  // parent re-creates the `defaults` object (and can hand us a fresh `procedure` reference
  // after a background sync) on every render, e.g. after a tab-visibility session refresh
  // triggers a resync. Seeding on every such re-render wiped in-progress drafts — the form
  // must only seed once, on the actual closed→open transition, not on every parent re-render.
  const procedureRef = useRef(procedure);
  procedureRef.current = procedure;
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  useEffect(() => {
    if (!open) return;
    const procedure = procedureRef.current;
    const defaults = defaultsRef.current;
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
    setSubmitGlobal(false);
    setSectorTags((procedure?.sectorTags ?? []) as WorkSector[]);
    setShareWithCompany(Boolean(procedure?.companyId));
    setUploading(false);
    setSaving(false);
    setSeedKey(procedure?.id ?? `new-${Date.now()}`);
  }, [open]);

  // Only offer "share with my company" once we know the user actually belongs to one.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;
      const {
        data: { user: authUser }
      } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data } = await supabase
        .from("wf_company_members")
        .select("company_id")
        .eq("user_id", authUser.id)
        .maybeSingle();
      if (!cancelled) setUserCompanyId((data?.company_id as string | undefined) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

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
      imageIds,
      sectorTags,
      companyId: shareWithCompany && userCompanyId ? userCompanyId : undefined
    };
    try {
      let savedId: string | undefined;
      if (procedure) {
        await updateProcedure(procedure, values);
        savedId = procedure.id;
      } else {
        savedId = await createProcedure(values);
      }
      savedRef.current = true;

      // Drop images the user removed during edit.
      const removed = [...removedExistingRef.current];
      removedExistingRef.current = new Set();
      const supabase = createSupabaseBrowserClient();
      if (removed.length && supabase) {
        for (const id of removed) {
          await performStandaloneAttachmentCloudDelete({ attachmentId: id, supabase, userId: null });
        }
      }

      // Submit a copy to the global pool if the user opted in.
      if (submitGlobal && user && supabase) {
        const result = await submitProcedureForGlobal(values, user, supabase, savedId);
        if (result.ok) {
          toast({
            title: isAdmin
              ? t("procedures.submitGlobal.adminPublishSuccessTitle")
              : t("procedures.submitGlobal.submitSuccessTitle"),
            description: isAdmin
              ? t("procedures.submitGlobal.adminPublishSuccessBody")
              : t("procedures.submitGlobal.submitSuccessBody")
          });
        } else if (result.code === "ALREADY_APPROVED") {
          toast({
            title: t("procedures.submitGlobal.alreadyApprovedTitle"),
            description: t("procedures.submitGlobal.alreadyApprovedBody")
          });
        } else if (result.code === "ALREADY_SUBMITTED") {
          toast({
            title: t("procedures.submitGlobal.alreadySubmittedTitle"),
            description: t("procedures.submitGlobal.alreadySubmittedBody")
          });
        } else {
          toast({
            title: t("procedures.submitGlobal.submitFailedTitle"),
            description: result.error,
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: isEdit
            ? t("procedures.toasts.updatedTitle")
            : t("procedures.toasts.createdTitle"),
          description: t("procedures.toasts.savedLocally")
        });
      }

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

          <div className="grid gap-2">
            <Label>{t("procedures.fields.sectorTags")}</Label>
            <div className="flex flex-wrap gap-2">
              {WORK_SECTORS.map((sector) => {
                const active = sectorTags.includes(sector);
                return (
                  <Button
                    key={sector}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() =>
                      setSectorTags((prev) =>
                        active ? prev.filter((s) => s !== sector) : [...prev, sector]
                      )
                    }
                  >
                    {t(`account.profile.sectorOptions.${sector}`)}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{t("procedures.fields.sectorTagsHint")}</p>
          </div>

          {userCompanyId && (
            <div className="rounded-xl border bg-muted/40 p-3.5">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="share-company"
                  checked={shareWithCompany}
                  onCheckedChange={(v) => setShareWithCompany(v === true)}
                  className="mt-0.5 shrink-0"
                />
                <div className="min-w-0 space-y-1">
                  <label htmlFor="share-company" className="cursor-pointer text-sm font-medium">
                    {t("procedures.shareCompany.checkboxLabel")}
                  </label>
                  <p className="text-xs text-muted-foreground">{t("procedures.shareCompany.checkboxHint")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Submit as global procedure — available both when creating and editing */}
          <div className="rounded-xl border bg-muted/40 p-3.5">
            <div className="flex items-start gap-3">
              <Checkbox
                id="submit-global"
                checked={submitGlobal}
                onCheckedChange={(v) => setSubmitGlobal(v === true)}
                className="mt-0.5 shrink-0"
              />
              <div className="min-w-0 space-y-1">
                <label
                  htmlFor="submit-global"
                  className="flex cursor-pointer items-center gap-1.5 text-sm font-medium"
                >
                  <Globe className="h-4 w-4 shrink-0 text-primary" />
                  {t("procedures.submitGlobal.checkboxLabel")}
                </label>
                <p className="text-xs text-muted-foreground">
                  {isAdmin
                    ? t("procedures.submitGlobal.adminCheckboxHint")
                    : t("procedures.submitGlobal.checkboxHint")}
                </p>
              </div>
            </div>
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
