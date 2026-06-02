"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BookOpen,
  Building2,
  FileText,
  Globe,
  ListTodo,
  Search,
  Ticket,
  User,
  Wrench
} from "lucide-react";
import {
  queryGlobalSearch,
  type GlobalSearchKind,
  type GlobalSearchResult
} from "@/lib/search/global-search-query";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

function kindIcon(kind: GlobalSearchKind) {
  switch (kind) {
    case "intervention":
      return Wrench;
    case "activity":
      return ListTodo;
    case "procedure":
      return BookOpen;
    case "globalProcedure":
      return Globe;
    case "client":
      return Building2;
    case "document":
      return FileText;
    case "ticket":
      return Ticket;
    default:
      return Search;
  }
}

function formatMetaDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function ResultRow({
  result,
  active,
  onSelect,
  onHover
}: {
  result: GlobalSearchResult;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const t = useTranslations();
  const Icon = kindIcon(result.kind);
  const dateLabel = formatMetaDate(result.meta);

  const statusLabel =
    result.statusKey && result.statusScope
      ? result.statusScope === "intervention"
        ? t(`interventions.status.${result.statusKey}`)
        : result.statusScope === "activity"
          ? t(`activities.status.${result.statusKey}`)
          : t(`tickets.status.${result.statusKey}`)
      : null;

  const categoryLabel = t(`search.global.categories.${result.kind}`);

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30",
        active && "bg-primary/5"
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-background",
          result.kind === "globalProcedure" && "border-violet-200 bg-violet-50 text-violet-800",
          result.kind === "procedure" && "border-sky-200 bg-sky-50 text-sky-800",
          result.kind === "document" && "border-amber-200 bg-amber-50 text-amber-900"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{result.title}</span>
          {result.badge === "pdf" ? (
            <span className="rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
              {t("search.global.badges.pdf")}
            </span>
          ) : null}
          {result.badge === "global" ? (
            <span className="inline-flex items-center gap-0.5 rounded-md border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-900">
              <Globe className="h-3 w-3" />
              {t("search.global.badges.global")}
            </span>
          ) : null}
          {result.badge === "personal" ? (
            <span className="inline-flex items-center gap-0.5 rounded-md border border-sky-300 bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-900">
              <User className="h-3 w-3" />
              {t("search.global.badges.personal")}
            </span>
          ) : null}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{categoryLabel}</span>
          {dateLabel && (result.kind === "intervention" || result.kind === "activity" || result.kind === "document" || result.kind === "ticket") ? (
            <>
              <span aria-hidden>·</span>
              <span suppressHydrationWarning>{dateLabel}</span>
            </>
          ) : null}
          {result.meta && result.kind === "client" ? (
            <>
              <span aria-hidden>·</span>
              <span>{result.meta}</span>
            </>
          ) : null}
          {statusLabel ? (
            <>
              <span aria-hidden>·</span>
              <span className="font-medium text-foreground/80">{statusLabel}</span>
            </>
          ) : null}
          {result.meta && (result.kind === "procedure" || result.kind === "globalProcedure") ? (
            <>
              <span aria-hidden>·</span>
              <span>{result.meta}</span>
            </>
          ) : null}
        </div>

        {result.preview ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {result.preview}
          </p>
        ) : null}
      </div>
    </button>
  );
}

export function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const liveEpoch = useWorkflowLiveEpoch();
  const listRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useLiveQuery(async () => queryGlobalSearch(q), [q, liveEpoch]);
  const list = results ?? [];

  useEffect(() => {
    setActiveIndex(0);
  }, [q, list.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      setQ("");
      setActiveIndex(0);
    }
  }, [open]);

  const navigateTo = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (!list.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = list[activeIndex];
      if (hit) navigateTo(hit.href);
    }
  }

  useEffect(() => {
    const el = listRef.current?.querySelector('[aria-selected="true"]');
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex min-h-11 w-full touch-manipulation items-center gap-2 rounded-xl border bg-muted px-3 text-left text-sm text-muted-foreground hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          compact ? "mt-0 py-2.5" : "mt-3 py-2.5"
        )}
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{t("search.global.buttonPlaceholder")}</span>
        <span className="hidden rounded-lg border bg-background px-2 py-0.5 text-xs sm:inline">
          ⌘K
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-4 sm:px-6">
            <DialogTitle>{t("search.global.dialogTitle")}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-0">
            <div className="border-b px-4 py-3 sm:px-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder={t("search.global.inputPlaceholder")}
                  className="h-12 pl-9 text-base"
                  autoComplete="off"
                  autoFocus
                  role="combobox"
                  aria-expanded={list.length > 0}
                  aria-controls="global-search-results"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t("search.global.keyboardHint")}</p>
            </div>

            <div
              id="global-search-results"
              ref={listRef}
              role="listbox"
              className="max-h-[min(60vh,28rem)] overflow-y-auto"
            >
              {list.map((r, idx) => (
                <ResultRow
                  key={`${r.kind}-${r.id}`}
                  result={r}
                  active={idx === activeIndex}
                  onHover={() => setActiveIndex(idx)}
                  onSelect={() => navigateTo(r.href)}
                />
              ))}

              {list.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-6">
                  {q.trim() ? t("search.global.emptyNoResults") : t("search.global.emptyTypeToSearch")}
                </div>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
