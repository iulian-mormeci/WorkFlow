"use client";

import { useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useToast } from "@/hooks/use-toast";
import { CalendarNavHeader } from "@/components/agenda/calendar-nav-header";
import { type CalendarEvent, useCalendarEvents } from "@/lib/calendar/use-calendar-events";
import { addMonths, dayKey, getMonthGrid, isSameDay } from "@/lib/calendar/grid";
import { makeDragId, parseDragId } from "@/lib/calendar/drag-id";
import { hexWithAlpha } from "@/lib/unoerp/color";
import { moveActivityById, moveInterventionById } from "@/lib/calendar/calendar-mutations";

const VISIBLE_PER_CELL = 3;
/** Default time of day used when a new item is created from a month-cell click. */
const DEFAULT_CREATE_HOUR = 9;

function DayCell({
  date,
  inCurrentMonth,
  events,
  onSelectDay,
  onOpenActivity,
  onOpenUnoErp,
  onRequestCreate
}: {
  date: Date;
  inCurrentMonth: boolean;
  events: CalendarEvent[];
  onSelectDay: (d: Date) => void;
  onOpenActivity: (id: string) => void;
  onOpenUnoErp: (event: CalendarEvent) => void;
  onRequestCreate: (d: Date) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(date) });
  const today = isSameDay(date, new Date());
  const visible = events.slice(0, VISIBLE_PER_CELL);
  const extra = events.length - visible.length;

  return (
    <div
      ref={setNodeRef}
      onClick={() => {
        const d = new Date(date);
        d.setHours(DEFAULT_CREATE_HOUR, 0, 0, 0);
        onRequestCreate(d);
      }}
      className={cn(
        "flex min-h-[6rem] cursor-pointer flex-col gap-1 border-b border-r p-1.5 last:border-r-0",
        !inCurrentMonth && "bg-muted/30",
        isOver && "bg-primary/5 ring-1 ring-inset ring-primary/30"
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelectDay(date);
        }}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
          today ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          !inCurrentMonth && "opacity-50"
        )}
      >
        {date.getDate()}
      </button>
      <div className="flex min-w-0 flex-col gap-0.5">
        {visible.map((event) => (
          <EventChip
            key={`${event.kind}-${event.id}`}
            event={event}
            onOpenActivity={onOpenActivity}
            onOpenUnoErp={onOpenUnoErp}
          />
        ))}
        {extra > 0 && <div className="px-1 text-[10px] text-muted-foreground">+{extra}</div>}
      </div>
    </div>
  );
}

function EventChip({
  event,
  onOpenActivity,
  onOpenUnoErp
}: {
  event: CalendarEvent;
  onOpenActivity: (id: string) => void;
  onOpenUnoErp: (event: CalendarEvent) => void;
}) {
  const isUnoErp = event.kind === "unoerp";
  const dragId = makeDragId(event.kind, event.id);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    disabled: event.completed || isUnoErp
  });

  const unoErpBg = isUnoErp ? hexWithAlpha(event.color, "26") : undefined;
  const className = cn(
    "truncate rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-tight",
    "touch-manipulation select-none",
    isUnoErp
      ? !unoErpBg && "border-dashed border-slate-400/40 bg-slate-400/10 text-slate-700 dark:text-slate-300"
      : event.kind === "intervention"
        ? "border-primary/20 bg-primary/10 text-primary"
        : "border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-400",
    event.completed && "opacity-50 line-through",
    isDragging && "opacity-70 shadow-md"
  );
  const style = {
    ...(transform ? { transform: CSS.Translate.toString(transform), zIndex: 20 } : undefined),
    backgroundColor: unoErpBg,
    borderColor: isUnoErp ? (event.color ?? undefined) : undefined
  };

  if (isUnoErp) {
    return (
      <button
        type="button"
        ref={setNodeRef}
        style={style}
        onClick={(e) => {
          e.stopPropagation();
          onOpenUnoErp(event);
        }}
        className={cn(className, "text-left")}
      >
        {event.title || "—"}
      </button>
    );
  }

  if (event.kind === "activity") {
    return (
      <button
        type="button"
        ref={setNodeRef}
        {...(event.completed ? {} : attributes)}
        {...(event.completed ? {} : listeners)}
        style={style}
        onClick={(e) => {
          e.stopPropagation();
          onOpenActivity(event.id);
        }}
        className={cn(className, "text-left")}
      >
        {event.title || "—"}
      </button>
    );
  }

  return (
    <Link
      href={event.href}
      ref={setNodeRef}
      {...(event.completed ? {} : attributes)}
      {...(event.completed ? {} : listeners)}
      onClick={(e) => e.stopPropagation()}
      style={style}
      className={className}
    >
      {event.title || "—"}
    </Link>
  );
}

export function CalendarMonthView({
  cursor,
  onCursorChange,
  onSelectDay,
  onOpenActivity,
  onOpenUnoErp,
  onRequestCreate
}: {
  cursor: Date;
  onCursorChange: (d: Date) => void;
  onSelectDay: (d: Date) => void;
  onOpenActivity: (id: string) => void;
  onOpenUnoErp: (event: CalendarEvent) => void;
  onRequestCreate: (d: Date) => void;
}) {
  const t = useTranslations("agenda");
  const { toast } = useToast();
  const events = useCalendarEvents();
  const month = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const weeks = useMemo(() => getMonthGrid(month), [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events ?? []) {
      const key = dayKey(e.start);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.start.getTime() - b.start.getTime());
    return map;
  }, [events]);

  const handleDragEnd = async (e: DragEndEvent) => {
    if (!e.over) return;
    const { kind, id } = parseDragId(String(e.active.id));
    if (kind === "unoerp") return;
    const targetKey = String(e.over.id);
    const original = (events ?? []).find((ev) => ev.kind === kind && ev.id === id);
    if (!original) return;
    if (dayKey(original.start) === targetKey) return;

    const [y, m, d] = targetKey.split("-").map(Number);
    const newStart = new Date(original.start);
    newStart.setFullYear(y, m - 1, d);

    try {
      if (kind === "intervention") await moveInterventionById(id, newStart);
      else await moveActivityById(id, newStart);
    } catch (err: any) {
      toast({ title: t("toasts.moveFailedTitle"), description: err?.message ?? String(err), variant: "destructive" });
    }
  };

  const weekdayLabels = t.raw("weekdaysShort") as string[];

  return (
    <div className="space-y-2">
      <CalendarNavHeader
        label={month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        onPrev={() => onCursorChange(addMonths(month, -1))}
        onNext={() => onCursorChange(addMonths(month, 1))}
        onToday={() => onCursorChange(new Date())}
      />
      <DndContext sensors={sensors} onDragEnd={(e) => void handleDragEnd(e)}>
        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[11px] font-semibold uppercase text-muted-foreground">
            {weekdayLabels.map((label) => (
              <div key={label} className="border-r py-1.5 last:border-r-0">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {weeks.flatMap((week) =>
              week.map((date) => (
                <DayCell
                  key={date.toISOString()}
                  date={date}
                  inCurrentMonth={date.getMonth() === month.getMonth()}
                  events={eventsByDay.get(dayKey(date)) ?? []}
                  onSelectDay={onSelectDay}
                  onOpenActivity={onOpenActivity}
                  onOpenUnoErp={onOpenUnoErp}
                  onRequestCreate={onRequestCreate}
                />
              ))
            )}
          </div>
        </div>
      </DndContext>
      <p className="text-xs text-muted-foreground">{t("create.cellHint")}</p>
    </div>
  );
}
