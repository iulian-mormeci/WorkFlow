"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { flattenChecklistTimeline, type ChecklistItem } from "@/lib/checklist/checklist-helpers";
import { useTranslations } from "next-intl";

type Props = {
  items: ChecklistItem[] | undefined;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function ChecklistTimeline({ items }: Props) {
  const t = useTranslations("checklist.timeline");
  const events = flattenChecklistTimeline(items ?? []);

  if (!events.length) return null;

  return (
    <div className="rounded-xl border bg-muted/30 p-3 md:p-4">
      <h3 className="text-sm font-semibold">{t("title")}</h3>
      <ul className="mt-3 space-y-2">
        {events.slice(0, 30).map((ev, idx) => (
          <li
            key={`${ev.itemId}-${ev.at}-${idx}`}
            className="flex min-w-0 items-start gap-2 text-sm"
          >
            {ev.done ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1">
              <span className="font-medium">{ev.label}</span>
              <span className="text-muted-foreground">
                {" "}
                — {ev.done ? t("completedAt", { time: formatTime(ev.at) }) : t("reopenedAt", { time: formatTime(ev.at) })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
