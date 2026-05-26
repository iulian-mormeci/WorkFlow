"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  done: number;
  total: number;
  className?: string;
  /** "compact" hides the icon and uses a thinner bar; "full" is the default card-ready layout. */
  variant?: "full" | "compact";
};

export function ChecklistProgress({
  done,
  total,
  className,
  variant = "full"
}: Props) {
  const t = useTranslations();
  const safeTotal = Math.max(0, total | 0);
  const safeDone = Math.min(Math.max(0, done | 0), safeTotal);
  const percent = safeTotal === 0 ? 0 : Math.round((safeDone / safeTotal) * 100);
  const isComplete = safeTotal > 0 && safeDone === safeTotal;
  const isEmpty = safeTotal === 0;

  const barColor = isEmpty
    ? "bg-muted-foreground/30"
    : isComplete
      ? "bg-emerald-500 dark:bg-emerald-400"
      : "bg-primary";

  const trackColor =
    "bg-muted ring-1 ring-inset ring-border/60 dark:ring-border";

  const compact = variant === "compact";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-background text-foreground",
        compact ? "px-3 py-2.5" : "px-4 py-3 sm:px-5 sm:py-4",
        "shadow-sm",
        className
      )}
      role="group"
      aria-label={t("checklist.progress.ariaLabel")}
    >
      <div className="flex items-center gap-3">
        {!compact ? (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              isComplete
                ? "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
                : "bg-primary/10 text-primary"
            )}
            aria-hidden
          >
            {isComplete ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <ListChecks className="h-5 w-5" />
            )}
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p
              className={cn(
                "font-semibold text-foreground",
                compact ? "text-xs" : "text-sm"
              )}
            >
              {isEmpty
                ? t("checklist.progress.emptyTitle")
                : isComplete
                  ? t("checklist.progress.completeTitle")
                  : t("checklist.progress.title")}
            </p>
            <p
              className={cn(
                "tabular-nums font-medium text-muted-foreground",
                compact ? "text-[11px]" : "text-xs"
              )}
              aria-live="polite"
            >
              {isEmpty
                ? t("checklist.progress.empty")
                : t("checklist.progress.summary", {
                    done: safeDone,
                    total: safeTotal,
                    percent
                  })}
            </p>
          </div>

          <div
            className={cn(
              "mt-2 w-full overflow-hidden rounded-full",
              trackColor,
              compact ? "h-1.5" : "h-2.5"
            )}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={
              isEmpty
                ? t("checklist.progress.empty")
                : t("checklist.progress.summary", {
                    done: safeDone,
                    total: safeTotal,
                    percent
                  })
            }
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none",
                barColor,
                isComplete && "shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
