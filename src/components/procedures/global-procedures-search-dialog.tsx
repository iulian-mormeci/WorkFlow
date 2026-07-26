"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BookOpen,
  Building2,
  CheckCircle2,
  Copy,
  Globe,
  Image as ImageIcon,
  Loader2,
  Search,
  Sparkles,
  Tag,
  User,
  Wrench
} from "lucide-react";
import {
  db,
  PROCEDURE_CATEGORIES,
  type CompanyProcedure,
  type GlobalProcedure,
  type Procedure
} from "@/lib/db/workflow-db";
import {
  cloneAllGlobalProceduresToPersonal,
  cloneCompanyProcedureToPersonal,
  cloneGlobalProcedureToPersonal
} from "@/lib/procedures/clone-global-procedure";
import {
  clonedGlobalIdSet,
  procedureLikeFromCompany,
  procedureLikeFromGlobal,
  procedureLikeFromPersonal,
  procedureSearchHaystack,
  type ProcedureLike
} from "@/lib/procedures/procedure-shared";
import { procedureHtmlToText } from "@/lib/procedures/sanitize-html";
import { scheduleWorkflowSync } from "@/lib/sync";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { WORK_SECTORS, type WorkSector } from "@/lib/account/sectors";
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
type ScopeTab = "all" | "global" | "personal" | "company";

type SearchHit =
  | { scope: "global"; row: GlobalProcedure }
  | { scope: "personal"; row: Procedure }
  | { scope: "company"; row: CompanyProcedure };

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
  const [scopeTab, setScopeTab] = useState<ScopeTab>("all");
  const [userSector, setUserSector] = useState<WorkSector | null>(null);
  const [sectorFilter, setSectorFilter] = useState<WorkSector | "all">("all");
  const [showAllSectors, setShowAllSectors] = useState(false);

  const [viewing, setViewing] = useState<SearchHit | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  // Default the sector filter to the user's own profile sector once known.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("wf_profiles").select("sector").eq("id", user.id).maybeSingle();
      const sector = (data?.sector as WorkSector | undefined) ?? null;
      if (!cancelled) {
        setUserSector(sector);
        setSectorFilter(sector ?? "all");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const data = useLiveQuery(async () => {
    const [globals, personal, company] = await Promise.all([
      db.globalProcedures.orderBy("updatedAt").reverse().toArray(),
      db.procedures.orderBy("updatedAt").reverse().toArray(),
      db.companyProcedures.orderBy("updatedAt").reverse().toArray()
    ]);
    const brands = uniqueSorted([
      ...globals.map((p) => p.brand),
      ...personal.map((p) => p.brand),
      ...company.map((p) => p.brand)
    ]);
    const models = uniqueSorted([
      ...globals.map((p) => p.model),
      ...personal.map((p) => p.model),
      ...company.map((p) => p.model)
    ]);

    const hits: SearchHit[] = [
      ...globals.map((row) => ({ scope: "global" as const, row })),
      ...personal.map((row) => ({ scope: "personal" as const, row })),
      ...company.map((row) => ({ scope: "company" as const, row }))
    ];

    const qv = q.trim().toLowerCase();
    const filtered = hits.filter((hit) => {
      if (scopeTab !== "all" && hit.scope !== scopeTab) return false;
      const p = hit.row;
      if (category !== "all" && p.category !== category) return false;
      if (brand !== "all" && (p.brand ?? "").toLowerCase() !== brand.toLowerCase()) return false;
      if (model !== "all" && (p.model ?? "").toLowerCase() !== model.toLowerCase()) return false;
      // Sector filter only narrows shared content (global/company) — personal procedures always show.
      if (!showAllSectors && sectorFilter !== "all" && hit.scope !== "personal") {
        const tags = (p as GlobalProcedure | CompanyProcedure).sectorTags ?? [];
        if (tags.length > 0 && !tags.includes(sectorFilter)) return false;
      }
      if (!qv) return true;
      const like: ProcedureLike =
        hit.scope === "global"
          ? procedureLikeFromGlobal(hit.row)
          : hit.scope === "company"
            ? procedureLikeFromCompany(hit.row)
            : procedureLikeFromPersonal(hit.row);
      return procedureSearchHaystack(like).includes(qv);
    });

    const cloned = clonedGlobalIdSet(personal);
    const uncloned = globals.filter((g) => (g.status ?? "approved") === "approved" && !cloned.has(g.id));

    return {
      filtered,
      brands,
      models,
      globalCount: globals.length,
      companyCount: company.length,
      cloned,
      uncloned
    };
  }, [q, category, brand, model, scopeTab, sectorFilter, showAllSectors, liveEpoch]);

  const list = data?.filtered ?? [];
  const brands = data?.brands ?? [];
  const models = data?.models ?? [];
  const hasCompanyProcedures = (data?.companyCount ?? 0) > 0 || scopeTab === "company";
  const clonedIds = data?.cloned ?? new Set<string>();
  const uncloned = data?.uncloned ?? [];

  const [addAllOpen, setAddAllOpen] = useState(false);
  const [addAllBusy, setAddAllBusy] = useState(false);

  async function handleAddAll() {
    if (addAllBusy) return;
    setAddAllBusy(true);
    try {
      const result = await cloneAllGlobalProceduresToPersonal(uncloned);
      scheduleWorkflowSync();
      setAddAllOpen(false);
      if (result.added > 0) {
        toast({
          title: t("procedures.global.addAllSuccessTitle"),
          description: t("procedures.global.addAllSuccessBody", { count: result.added })
        });
      } else {
        toast({ title: t("procedures.global.addAllNoneTitle") });
      }
    } catch (e) {
      toast({
        title: t("procedures.global.addAllFailedTitle"),
        description: e instanceof Error ? e.message : t("common.unknownError"),
        variant: "destructive"
      });
    } finally {
      setAddAllBusy(false);
    }
  }

  const viewingLike: ProcedureLike | null = useMemo(() => {
    if (!viewing) return null;
    return viewing.scope === "global"
      ? procedureLikeFromGlobal(viewing.row)
      : viewing.scope === "company"
        ? procedureLikeFromCompany(viewing.row)
        : procedureLikeFromPersonal(viewing.row);
  }, [viewing]);

  async function handleCopy(hit: { scope: "global"; row: GlobalProcedure } | { scope: "company"; row: CompanyProcedure }) {
    if (copyingId) return;
    setCopyingId(hit.row.id);
    try {
      const newId =
        hit.scope === "global"
          ? await cloneGlobalProcedureToPersonal(hit.row)
          : await cloneCompanyProcedureToPersonal(hit.row);
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
      if (e instanceof Error && e.name === "ProcedureAlreadyClonedError") {
        toast({
          title: t("procedures.global.alreadyCopiedTitle"),
          description: t("procedures.global.alreadyCopiedBody")
        });
        setViewing(null);
        onOpenChange(false);
        return;
      }
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
                  ["personal", t("procedures.global.scopePersonal")],
                  ...(hasCompanyProcedures ? [["company", t("procedures.company.scopeCompany")] as const] : [])
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={scopeTab === key ? "default" : "outline"}
                  className="min-h-10"
                  onClick={() => setScopeTab(key as ScopeTab)}
                >
                  {key === "global" ? (
                    <Globe className="mr-1.5 h-4 w-4" />
                  ) : key === "personal" ? (
                    <User className="mr-1.5 h-4 w-4" />
                  ) : key === "company" ? (
                    <Building2 className="mr-1.5 h-4 w-4" />
                  ) : null}
                  {label}
                </Button>
              ))}
            </div>

            {uncloned.length > 0 && scopeTab !== "personal" && scopeTab !== "company" ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200/80 bg-violet-50/40 p-2.5 dark:border-violet-900/50 dark:bg-violet-950/20">
                <p className="text-xs text-violet-950 dark:text-violet-100">
                  {t("procedures.global.uncopiedCount", { count: uncloned.length })}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="min-h-9 gap-1.5 bg-violet-600 hover:bg-violet-700"
                  onClick={() => setAddAllOpen(true)}
                >
                  <Copy className="h-4 w-4" />
                  {t("procedures.global.addAllButton")}
                </Button>
              </div>
            ) : null}

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

            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2.5">
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={sectorFilter}
                disabled={showAllSectors}
                onChange={(e) => setSectorFilter(e.target.value as WorkSector | "all")}
              >
                <option value="all">{t("procedures.filters.sectorAll")}</option>
                {WORK_SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {t(`account.profile.sectorOptions.${s}`)}
                    {s === userSector ? ` (${t("procedures.filters.sectorYours")})` : ""}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={showAllSectors}
                  onChange={(e) => setShowAllSectors(e.target.checked)}
                />
                {t("procedures.filters.showAllSectors")}
              </label>
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
                const isCompany = hit.scope === "company";
                const alreadyCloned = isGlobal && clonedIds.has(p.id);
                return (
                  <div
                    key={`${hit.scope}-${p.id}`}
                    className={cn(
                      "rounded-2xl border p-4",
                      isGlobal && "border-violet-200/80 bg-violet-50/40 dark:border-violet-900/50 dark:bg-violet-950/20",
                      isCompany && "border-amber-200/80 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20"
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
                        ) : isCompany ? (
                          <Badge className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                            <Building2 className="mr-1 h-3 w-3" />
                            {t("procedures.company.badge")}
                          </Badge>
                        ) : (
                          <Badge className="border-sky-300 bg-sky-50 text-sky-900">
                            <User className="mr-1 h-3 w-3" />
                            {t("procedures.global.personalBadge")}
                          </Badge>
                        )}
                        {alreadyCloned ? (
                          <Badge className="border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            {t("procedures.global.alreadyInLibraryBadge")}
                          </Badge>
                        ) : null}
                        {!isGlobal && !isCompany && userSector && (hit.row as Procedure).sectorTags?.includes(userSector) ? (
                          <Badge className="border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                            <Sparkles className="mr-1 h-3 w-3" />
                            {t("procedures.filters.sectorYours")}
                          </Badge>
                        ) : null}
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
                      {(isGlobal || isCompany) && !alreadyCloned ? (
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-10 gap-1.5 bg-violet-600 hover:bg-violet-700"
                          disabled={Boolean(copyingId)}
                          onClick={() => {
                            if (hit.scope === "global" || hit.scope === "company") void handleCopy(hit);
                          }}
                        >
                          {copyingId === p.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
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
          (viewing?.scope === "global" && !clonedIds.has(viewing.row.id)) || viewing?.scope === "company"
            ? () => void handleCopy(viewing)
            : undefined
        }
        copying={(viewing?.scope === "global" || viewing?.scope === "company") && copyingId === viewing.row.id}
      />

      <Dialog open={addAllOpen} onOpenChange={(o) => !addAllBusy && setAddAllOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("procedures.global.addAllConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("procedures.global.addAllConfirmBody", { count: uncloned.length })}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setAddAllOpen(false)} disabled={addAllBusy}>
              {t("common.cancel")}
            </Button>
            <Button
              className="gap-2 bg-violet-600 hover:bg-violet-700"
              onClick={() => void handleAddAll()}
              disabled={addAllBusy}
            >
              {addAllBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {addAllBusy ? t("procedures.global.addAllBusy") : t("procedures.global.addAllButton")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
