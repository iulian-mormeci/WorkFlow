"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BookOpen,
  Globe,
  Image as ImageIcon,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  User,
  Wrench
} from "lucide-react";
import {
  PROCEDURE_CATEGORIES,
  db,
  type Procedure
} from "@/lib/db/workflow-db";
import { procedureHtmlToText } from "@/lib/procedures/sanitize-html";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { performProcedureCloudSyncDelete } from "@/lib/sync/cloud-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { GlobalProceduresSearchDialog } from "@/components/procedures/global-procedures-search-dialog";
import { ProcedureFormDialog } from "@/components/procedures/procedure-form-dialog";
import { ProcedureViewDialog } from "@/components/procedures/procedure-view-dialog";
import { procedureLikeFromPersonal } from "@/lib/procedures/procedure-shared";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type CategoryFilter = "all" | Procedure["category"];

const SELECT_CLASS =
  "h-11 w-full rounded-xl border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

function uniqueSorted(values: (string | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const t = v?.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (!seen.has(key)) seen.set(key, t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function ProceduresClient() {
  const t = useTranslations();
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [brand, setBrand] = useState("all");
  const [model, setModel] = useState("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Procedure | null>(null);
  const [viewing, setViewing] = useState<Procedure | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Procedure | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  const globalCount = useLiveQuery(
    () => db.globalProcedures.count(),
    [liveEpoch]
  );

  const data = useLiveQuery(async () => {
    const all = await db.procedures.orderBy("updatedAt").reverse().toArray();
    const brands = uniqueSorted(all.map((p) => p.brand));
    const models = uniqueSorted(all.map((p) => p.model));

    const qv = q.trim().toLowerCase();
    const filtered = all.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (brand !== "all" && (p.brand ?? "").toLowerCase() !== brand.toLowerCase()) return false;
      if (model !== "all" && (p.model ?? "").toLowerCase() !== model.toLowerCase()) return false;
      if (!qv) return true;
      const haystack = [
        p.title,
        p.brand ?? "",
        p.model ?? "",
        (p.tags ?? []).join(" "),
        procedureHtmlToText(p.content ?? "")
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(qv);
    });

    return { filtered, brands, models, total: all.length };
  }, [q, category, brand, model, liveEpoch]);

  const list = data?.filtered ?? [];
  const brands = data?.brands ?? [];
  const models = data?.models ?? [];

  const activeFilters = useMemo(
    () => category !== "all" || brand !== "all" || model !== "all" || q.trim().length > 0,
    [category, brand, model, q]
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(p: Procedure) {
    setViewing(null);
    setEditing(p);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await performProcedureCloudSyncDelete({
        procedureId: deleteTarget.id,
        imageIds: deleteTarget.imageIds ?? [],
        supabase,
        userId: null
      });
      if (!res.ok) {
        toast({
          title: t("procedures.toasts.deleteFailedTitle"),
          description: res.message,
          variant: "destructive"
        });
      } else {
        toast({ title: t("procedures.toasts.deletedTitle") });
      }
      setDeleteTarget(null);
    } catch (e) {
      toast({
        title: t("procedures.toasts.deleteFailedTitle"),
        description: e instanceof Error ? e.message : t("common.unknownError"),
        variant: "destructive"
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("procedures.searchPlaceholder")}
            className="h-11 pl-9"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
          <Button
            type="button"
            variant="secondary"
            className="h-11 gap-2 border-violet-200 bg-violet-50 text-violet-950 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-950/60"
            onClick={() => setGlobalSearchOpen(true)}
          >
            <Globe className="h-4 w-4 shrink-0" />
            <span className="font-semibold">{t("procedures.global.searchButton")}</span>
          </Button>
          <Button size="lg" onClick={openCreate} className="h-11 shrink-0">
            <Plus className="h-5 w-5" />
            {t("procedures.actions.new")}
          </Button>
        </div>
      </div>
      {(globalCount ?? 0) > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("procedures.global.presetsAvailable", { count: globalCount ?? 0 })}
        </p>
      ) : null}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge className="border-sky-300 bg-sky-50 text-sky-900">
          <User className="mr-1 h-3 w-3" />
          {t("procedures.global.myProceduresLabel")}
        </Badge>
        <span>{t("procedures.global.myProceduresHint")}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr] sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", ...PROCEDURE_CATEGORIES] as const).map((c) => (
            <Button
              key={c}
              size="sm"
              variant={category === c ? "default" : "outline"}
              onClick={() => setCategory(c)}
            >
              {c === "all" ? t("procedures.filters.categoryAll") : t(`procedures.categories.${c}`)}
            </Button>
          ))}
        </div>
        <select
          className={SELECT_CLASS}
          value={brands.some((b) => b.toLowerCase() === brand.toLowerCase()) ? brand : "all"}
          onChange={(e) => setBrand(e.target.value)}
          aria-label={t("procedures.filters.brand")}
        >
          <option value="all">{t("procedures.filters.brandAll")}</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          value={models.some((m) => m.toLowerCase() === model.toLowerCase()) ? model : "all"}
          onChange={(e) => setModel(e.target.value)}
          aria-label={t("procedures.filters.model")}
        >
          <option value="all">{t("procedures.filters.modelAll")}</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2.5 lg:grid-cols-2 lg:gap-3">
        {list.map((p) => {
          const preview = procedureHtmlToText(p.content ?? "");
          const imageCount = p.imageIds?.length ?? 0;
          return (
            <div key={p.id} className="rounded-2xl border p-4 transition-colors hover:bg-muted/40">
              <button
                type="button"
                className="block w-full text-left focus-visible:outline-none"
                onClick={() => setViewing(p)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-base font-semibold">
                    {p.category === "brand_model" ? (
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                    )}
                    {p.title}
                  </span>
                  {p.brand ? (
                    <span className="rounded-full border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                      {p.brand}
                      {p.model ? ` · ${p.model}` : ""}
                    </span>
                  ) : p.model ? (
                    <span className="rounded-full border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                      {p.model}
                    </span>
                  ) : null}
                  {imageCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                      <ImageIcon className="h-3 w-3" />
                      {imageCount}
                    </span>
                  ) : null}
                </div>

                {preview ? (
                  <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{preview}</div>
                ) : null}

                {p.tags?.length ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {p.tags.map((tag) => (
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
              </button>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                <Button type="button" size="sm" variant="default" onClick={() => setViewing(p)}>
                  <BookOpen className="h-4 w-4" />
                  {t("procedures.actions.open")}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => openEdit(p)}>
                  <Pencil className="h-4 w-4" />
                  {t("common.edit")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-red-700 hover:bg-red-50"
                  onClick={() => setDeleteTarget(p)}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("common.delete")}
                </Button>
              </div>
            </div>
          );
        })}

        {list.length === 0 ? (
          <div className={cn("rounded-2xl border px-4 py-12 text-center text-sm text-muted-foreground")}>
            {activeFilters ? t("procedures.emptyFiltered") : t("procedures.empty")}
          </div>
        ) : null}
      </div>

      <ProcedureFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        procedure={editing}
        defaults={
          !editing
            ? {
                brand: brand !== "all" ? brand : undefined,
                model: model !== "all" ? model : undefined
              }
            : undefined
        }
      />

      <GlobalProceduresSearchDialog
        open={globalSearchOpen}
        onOpenChange={setGlobalSearchOpen}
        onPersonalEdit={openEdit}
        onCopiedEdit={(p) => openEdit(p)}
      />

      <ProcedureViewDialog
        open={Boolean(viewing)}
        onOpenChange={(o) => {
          if (!o) setViewing(null);
        }}
        procedure={viewing ? procedureLikeFromPersonal(viewing) : null}
        scope="personal"
        onEdit={viewing ? () => openEdit(viewing) : undefined}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("procedures.deleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("procedures.deleteDialog.body", { title: deleteTarget?.title ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {t("common.cancel")}
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? t("common.deleting") : t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
