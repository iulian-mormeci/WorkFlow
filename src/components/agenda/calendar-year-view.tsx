"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { CalendarNavHeader } from "@/components/agenda/calendar-nav-header";
import { useCalendarEvents } from "@/lib/calendar/use-calendar-events";
import { addYears, dayKey, getMonthGrid, getYearMonths, isSameDay } from "@/lib/calendar/grid";

function MiniMonth({
  month,
  daysWithEvents,
  onSelectMonth,
  onSelectDay
}: {
  month: Date;
  daysWithEvents: Set<string>;
  onSelectMonth: (d: Date) => void;
  onSelectDay: (d: Date) => void;
}) {
  const weeks = useMemo(() => getMonthGrid(month), [month]);
  const today = new Date();

  return (
    <div className="rounded-xl border p-2">
      <button
        type="button"
        onClick={() => onSelectMonth(month)}
        className="mb-1.5 w-full rounded-md px-1 py-0.5 text-left text-xs font-semibold capitalize hover:bg-muted"
      >
        {month.toLocaleDateString(undefined, { month: "long" })}
      </button>
      <div className="grid grid-cols-7 gap-y-0.5 text-center text-[10px]">
        {weeks.flatMap((week) =>
          week.map((date) => {
            const inMonth = date.getMonth() === month.getMonth();
            const hasEvents = daysWithEvents.has(dayKey(date));
            return (
              <button
                type="button"
                key={date.toISOString()}
                onClick={() => onSelectDay(date)}
                disabled={!inMonth}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded py-0.5",
                  inMonth ? "hover:bg-muted" : "opacity-0",
                  isSameDay(date, today) && "font-bold text-primary"
                )}
              >
                <span>{date.getDate()}</span>
                <span className={cn("h-1 w-1 rounded-full", hasEvents && inMonth ? "bg-primary" : "bg-transparent")} />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function CalendarYearView({
  cursor,
  onCursorChange,
  onSelectMonth,
  onSelectDay
}: {
  cursor: Date;
  onCursorChange: (d: Date) => void;
  onSelectMonth: (d: Date) => void;
  onSelectDay: (d: Date) => void;
}) {
  const t = useTranslations("agenda");
  const events = useCalendarEvents();
  const year = useMemo(() => new Date(cursor.getFullYear(), 0, 1), [cursor]);

  const daysWithEvents = useMemo(() => {
    const set = new Set<string>();
    for (const e of events ?? []) set.add(dayKey(e.start));
    return set;
  }, [events]);

  const months = useMemo(() => getYearMonths(year), [year]);

  return (
    <div className="space-y-2">
      <CalendarNavHeader
        label={String(year.getFullYear())}
        onPrev={() => onCursorChange(addYears(year, -1))}
        onNext={() => onCursorChange(addYears(year, 1))}
        onToday={() => onCursorChange(new Date())}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((month) => (
          <MiniMonth
            key={month.toISOString()}
            month={month}
            daysWithEvents={daysWithEvents}
            onSelectMonth={onSelectMonth}
            onSelectDay={onSelectDay}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("yearHint")}</p>
    </div>
  );
}
