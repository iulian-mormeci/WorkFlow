"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BookOpen,
  Copy,
  Globe,
  Image as ImageIcon,
  Search,
  Tag,
  User,
  Wrench
} from "lucide-react";
import { db, PROCEDURE_CATEGORIES, type GlobalProcedure, type Procedure } from "@/lib/db/workflow-db";
import { cloneGlobalProcedureToPersonal } from "@/lib/procedures/clone-global-procedure";
import {
  procedureLikeFromGlobal,
  procedureLikeFromPersonal,
  procedureSearchHaystack,
  type ProcedureLike
} from "@/lib/procedures/procedure-shared";
import { procedureHtmlToText } from "@/lib/procedures/sanitize-html";
import { scheduleWorkflowSync } from "@/lib/sync";
import { ProcedureViewDialog } from "@/components/procedures/procedure-view-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type CategoryFilter = "all" | Procedure["category"];

type SearchHit =
  | { scope: "global"; row: GlobalProcedure }
  | { scope: "personal"; row: Procedure };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPersonalEdit?: (procedure: Procedure) => void;
  /** After copy, open the new personal procedure for editing. */
  onCopiedEdit?: (procedure: Procedure) => void;
};

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

const SELECT_CLASS =
  "h-11 w-full rounded-xl border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

export function GlobalProceduresSearchDialog({
  open,
  onOpenChange,
  onPersonalEdit,
  onCopiedEdit
}: Props) {
  const t = useTranslations();
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [brand, setBrand] = useState("all");
  const [model, setModel] = useState("all");
  const [scopeTab, setScopeTab] = useState<"all" | "global" | "personal">("all");

  const [viewing, setViewing] = useState<SearchHit | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const [globals, personal] = await Promise.all([
      db.globalProcedures.orderBy("updatedAt").reverse().toArray(),
      db.procedures.orderBy("updatedAt").reverse().toArray()
    ]);
    const brands = uniqueSorted([
      ...globals.map((p) => p.brand),
      ...personal.map((p) => p.brand)
    ]);
    const models = uniqueSorted([
      ...globals.map((p) => p.model),
      ...personal.map((p) => p.model)
    ]);

    const hits: SearchHit[] = [
      ...globals.map((row) => ({ scope: "global" as const, row })),
      ...personal.map((row) => ({ scope: "personal" as const, row }))
    ];

    const qv = q.trim().toLowerCase();
    const filtered = hits.filter((hit) => {
      if (scopeTab === "global" && hit.scope !== "global") return false;
      if (scopeTab === "personal" && hit.scope !== "personal") return false;
      const p = hit.row;
      if (category !== "all" && p.category !== category) return false;
      if (brand !== "all" && (p.brand ?? "").toLowerCase() !== brand.toLowerCase()) return false;
      if (model !== "all" && (p.model ?? "").toLowerCase() !== model.toLowerCase()) return false;
      if (!qv) return true;
      const like: ProcedureLike =
        hit.scope === "global"
          ? procedureLikeFromGlobal(hit.row)
          : procedureLikeFromPersonal(hit.row);
      return procedureSearchHaystack(like).includes(qv);
    });

    return { filtered, brands, models, globalCount: globals.length };
  }, [q, category, brand, model, scopeTab, liveEpoch]);

  const list = data?.filtered ?? [];
  const brands = data?.brands ?? [];
  const models = data?.models ?? [];

  const viewingLike: ProcedureLike | null = useMemo(() => {
    if (!viewing) return null;
    return viewing.scope === "global"
      ? procedureLikeFromGlobal(viewing.row)
      : procedureLikeFromPersonal(viewing.row);
  }, [viewing]);

  async function handleCopy(global: GlobalProcedure) {
    if (copyingId) return;
    setCopyingId(global.id);
    try {
      const newId = await cloneGlobalProcedureToPersonal(global);
      scheduleWorkflowSync();
      const created = await db.procedures.get(newId);
      toast({
        title: t("procedures.global.copySuccessTitle"),
        description: t("procedures.global.copySuccessBody")
      });
      setViewing(null);
      onOpenChange(false);
      if (created && onCopiedEdit) onCopiedEdit(created);
    } catch (e) {
      toast({
        title: t("procedures.global.copyFailedTitle"),
        description: e instanceof Error ? e.message : t("common.unknownError"),
        variant: "destructive"
      });
    } finally {
      setCopyingId(null);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-4 sm:px-6">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5 text-violet-600" />
              {t("procedures.global.searchTitle")}
            </DialogTitle>
            <DialogDescription>{t("procedures.global.searchSubtitle")}</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("procedures.global.searchPlaceholder")}
                className="h-12 pl-9 text-base"
                autoFocus
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", t("procedures.global.scopeAll")],
                  ["global", t("procedures.global.scopeGlobal")],
                  ["personal", t("procedures.global.scopePersonal")]
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={scopeTab === key ? "default" : "outline"}
                  className="min-h-10"
                  onClick={() => setScopeTab(key)}
                >
                  {key === "global" ? (
                    <Globe className="mr-1.5 h-4 w-4" />
                  ) : key === "personal" ? (
                    <User className="mr-1.5 h-4 w-4" />
                  ) : null}
                  {label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(["all", ...PROCEDURE_CATEGORIES] as const).map((c) => (
                <Button
                  key={c}
                  type="button"
                  size="sm"
                  variant={category === c ? "default" : "outline"}
                  className="min-h-9"
                  onClick={() => setCategory(c)}
                >
                  {c === "all"
                    ? t("procedures.filters.categoryAll")
                    : t(`procedures.categories.${c}`)}
                </Button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className={SELECT_CLASS}
                value={
                  brands.some((b) => b.toLowerCase() === brand.toLowerCase()) ? brand : "all"
                }
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
                value={
                  models.some((m) => m.toLowerCase() === model.toLowerCase()) ? model : "all"
                }
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

            <div className="grid gap-2">
              {list.map((hit) => {
                const p = hit.row;
                const preview = procedureHtmlToText(p.content ?? "");
                const imageCount = p.imageIds?.length ?? 0;
                const isGlobal = hit.scope === "global";
                return (
                  <div
                    key={`${hit.scope}-${p.id}`}
                    className={cn(
                      "rounded-2xl border p-4",
                      isGlobal ? "border-violet-200/80 bg-violet-50/40 dark:border-violet-900/50 dark:bg-violet-950/20" : ""
                    )}
                  >
                    <button
                      type="button"
                      className="block w-full text-left focus-visible:outline-none"
                      onClick={() => setViewing(hit)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {isGlobal ? (
                          <Badge className="border-violet-300 bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100">
                            <Globe className="mr-1 h-3 w-3" />
                            {t("procedures.global.badge")}
                          </Badge>
                        ) : (
                          <Badge className="border-sky-300 bg-sky-50 text-sky-900">
                            <User className="mr-1 h-3 w-3" />
                            {t("procedures.global.personalBadge")}
                          </Badge>
                        )}
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
                        ) : null}
                        {imageCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                            <ImageIcon className="h-3 w-3" />
                            {imageCount}
                          </span>
                        ) : null}
                      </div>
                      {preview ? (
                        <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {preview}
                        </div>
                      ) : null}
                      {p.tags?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
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

                    <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-10"
                        onClick={() => setViewing(hit)}
                      >
                        {t("procedures.actions.open")}
                      </Button>
                      {isGlobal ? (
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-10 bg-violet-600 hover:bg-violet-700"
                          disabled={copyingId === p.id}
                          onClick={() => {
                            if (hit.scope === "global") void handleCopy(hit.row);
                          }}
                        >
                          <Copy className="h-4 w-4" />
                          {copyingId === p.id
                            ? t("procedures.global.copying")
                            : t("procedures.global.copyToAccount")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {list.length === 0 ? (
                <p className="rounded-2xl border px-4 py-10 text-center text-sm text-muted-foreground">
                  {t("procedures.global.searchEmpty")}
                </p>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ProcedureViewDialog
        open={Boolean(viewing)}
        onOpenChange={(o) => {
          if (!o) setViewing(null);
        }}
        procedure={viewingLike}
        scope={viewing?.scope}
        onEdit={
          viewing?.scope === "personal"
            ? () => {
                const p = viewing.row;
                setViewing(null);
                onOpenChange(false);
                onPersonalEdit?.(p);
              }
            : undefined
        }
        onCopy={
          viewing?.scope === "global" ? () => void handleCopy(viewing.row) : undefined
        }
        copying={viewing?.scope === "global" && copyingId === viewing.row.id}
      />
    </>
  );
}
