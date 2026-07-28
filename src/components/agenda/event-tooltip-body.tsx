"use client";

import { cn } from "@/lib/utils";
import { unoErpPriorityClassName } from "@/lib/unoerp/color";
import type { CalendarEvent } from "@/lib/calendar/use-calendar-events";
import { useTranslations } from "next-intl";

/** Rich hover/tooltip content for a calendar event — shared by the agenda week view and dashboard widgets. */
export function EventTooltipBody({ event }: { event: CalendarEvent }) {
  const t = useTranslations("agenda.eventTooltip");
  const timeRange = `${event.start.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  })} → ${event.end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {event.kind === "unoerp" && (
          <span className="shrink-0 rounded-sm bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-900 dark:bg-violet-950 dark:text-violet-100">
            ERP
          </span>
        )}
        <div className="text-sm font-bold text-foreground">{event.title || "—"}</div>
      </div>

      {event.subtitle && (
        <div className="flex gap-1.5">
          <span className="shrink-0 text-muted-foreground">{t("clientLabel")}</span>
          <span className="font-medium text-foreground">{event.subtitle}</span>
        </div>
      )}

      <div className="space-y-1 border-t pt-2">
        <div className="flex gap-1.5">
          <span className="shrink-0 text-muted-foreground">{t("timeLabel")}</span>
          <span className="font-medium text-foreground">{timeRange}</span>
        </div>
        {event.dueAt && (
          <div className="flex gap-1.5">
            <span className="shrink-0 text-muted-foreground">{t("dueBy")}</span>
            <span className="font-medium text-foreground">
              {event.dueAt.toLocaleString(undefined, {
                weekday: "short",
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit"
              })}
            </span>
          </div>
        )}
      </div>

      {(event.category || event.ticketType || event.priority) && (
        <div className="space-y-1 border-t pt-2">
          {event.category && (
            <div className="flex gap-1.5">
              <span className="shrink-0 text-muted-foreground">{t("categoryLabel")}</span>
              <span className="font-medium text-foreground">{event.category}</span>
            </div>
          )}
          {event.ticketType && (
            <div className="flex gap-1.5">
              <span className="shrink-0 text-muted-foreground">{t("typeLabel")}</span>
              <span className="font-medium text-foreground">{event.ticketType}</span>
            </div>
          )}
          {event.priority && (
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-muted-foreground">{t("priorityLabel")}</span>
              <span
                className={cn(
                  "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  unoErpPriorityClassName(event.priority)
                )}
              >
                {event.priority}
              </span>
            </div>
          )}
        </div>
      )}

      {event.description && (
        <div className="border-t pt-2">
          <p className="line-clamp-3 whitespace-pre-line text-foreground">{event.description}</p>
        </div>
      )}
    </div>
  );
}
