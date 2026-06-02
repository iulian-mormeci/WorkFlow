"use client";

import { BookOpen, Clock3, Globe, ListChecks, Sparkles, User } from "lucide-react";
import type {
  ChecklistSuggestion,
  IntelligentSuggestions,
  ProcedureSuggestion
} from "@/lib/suggestions/intelligent-suggestions";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

type Props = {
  suggestions: IntelligentSuggestions | null | undefined;
  loading?: boolean;
  onAddChecklist: (label: string) => void;
  onAddProcedure: (proc: ProcedureSuggestion) => void;
  onApplyDuration: (minutes: number) => void;
  existingChecklistLabels?: string[];
  showDuration?: boolean;
  disabled?: boolean;
};

function ProcedureChip({
  proc,
  onAdd,
  disabled
}: {
  proc: ProcedureSuggestion;
  onAdd: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const meta = [proc.brand, proc.model].filter(Boolean).join(" · ");
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      className="min-h-10 max-w-full touch-manipulation rounded-full border-violet-200 bg-violet-50/80 px-3 text-left text-violet-950 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100"
      onClick={onAdd}
    >
      {proc.scope === "global" ? (
        <Globe className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-80" />
      ) : (
        <User className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-80" />
      )}
      <BookOpen className="mr-1 h-3.5 w-3.5 shrink-0 opacity-70" />
      <span className="truncate">
        {proc.title}
        {meta ? <span className="ml-1 font-normal opacity-70">({meta})</span> : null}
      </span>
      <span className="sr-only">{t("suggestions.addProcedure")}</span>
    </Button>
  );
}

function ChecklistChip({
  item,
  onAdd,
  disabled
}: {
  item: ChecklistSuggestion;
  onAdd: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      className="min-h-10 max-w-full touch-manipulation rounded-full border-sky-200 bg-sky-50/80 px-3 text-left text-sky-950 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100"
      onClick={onAdd}
    >
      <ListChecks className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-80" />
      <span className="truncate">{item.label}</span>
    </Button>
  );
}

export function FormSuggestionsPanel({
  suggestions,
  loading,
  onAddChecklist,
  onAddProcedure,
  onApplyDuration,
  existingChecklistLabels = [],
  showDuration = true,
  disabled
}: Props) {
  const t = useTranslations();
  const exclude = new Set(existingChecklistLabels.map((l) => l.trim().toLowerCase()));

  const checklists =
    suggestions?.checklists.filter((c) => !exclude.has(c.label.trim().toLowerCase())) ?? [];
  const procedures = suggestions?.procedures ?? [];
  const duration = showDuration ? suggestions?.duration : null;

  const hasContent = checklists.length > 0 || procedures.length > 0 || Boolean(duration);
  if (!loading && !hasContent) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-violet-500/5 p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("suggestions.title")}</p>
          <p className="text-xs text-muted-foreground">{t("suggestions.subtitle")}</p>
        </div>
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-muted-foreground">{t("suggestions.loading")}</p>
      ) : null}

      {!loading && duration ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">{t("suggestions.duration")}</p>
          <div className="mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="min-h-10 touch-manipulation rounded-full border-amber-200 bg-amber-50/90 text-amber-950 hover:bg-amber-100"
              onClick={() => onApplyDuration(duration.minutes)}
            >
              <Clock3 className="mr-1.5 h-3.5 w-3.5" />
              {t("suggestions.durationChip", {
                minutes: duration.minutes,
                count: duration.sampleCount
              })}
            </Button>
          </div>
        </div>
      ) : null}

      {!loading && checklists.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">{t("suggestions.checklists")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {checklists.map((item) => (
              <ChecklistChip
                key={item.label}
                item={item}
                disabled={disabled}
                onAdd={() => onAddChecklist(item.label)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {!loading && procedures.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">{t("suggestions.procedures")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {procedures.map((proc) => (
              <ProcedureChip
                key={`${proc.scope}-${proc.id}`}
                proc={proc}
                disabled={disabled}
                onAdd={() => onAddProcedure(proc)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
