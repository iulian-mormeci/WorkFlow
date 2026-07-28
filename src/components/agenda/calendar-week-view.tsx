"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EventTooltipBody } from "@/components/agenda/event-tooltip-body";
import { CalendarNavHeader } from "@/components/agenda/calendar-nav-header";
import { type CalendarEvent, useCalendarEvents } from "@/lib/calendar/use-calendar-events";
import { addWeeks, dayKey, getWeekDays, isSameDay } from "@/lib/calendar/grid";
import { makeDragId, parseDragId } from "@/lib/calendar/drag-id";
import { hexWithAlpha } from "@/lib/unoerp/color";
import {
  moveActivityById,
  moveInterventionById,
  resizeInterventionById
} from "@/lib/calendar/calendar-mutations";
import {
  DEFAULT_WORKING_HOURS,
  dayWorkingRanges,
  loadWorkingHours,
  overallWorkingWindow,
  weekdayMon0,
  type WorkingHoursConfig
} from "@/lib/interventions/working-hours";

const DEFAULT_HOUR_HEIGHT = 56; // px per hour, used when not fitting to a measured container
const MIN_FIT_HOUR_HEIGHT = 16;
const MAX_FIT_HOUR_HEIGHT = 72;
const SNAP_MINUTES = 15;

function minutesFromMidnight(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

function snapMinutes(rawMinutes: number) {
  return Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function EventBlock({
  event,
  windowStartMinutes,
  hourHeight,
  onResizeCommit,
  onOpenActivity,
  onOpenUnoErp
}: {
  event: CalendarEvent;
  windowStartMinutes: number;
  hourHeight: number;
  onResizeCommit: (id: string, deltaMinutes: number) => void;
  onOpenActivity: (id: string) => void;
  onOpenUnoErp: (event: CalendarEvent) => void;
}) {
  const isUnoErp = event.kind === "unoerp";
  const dragId = makeDragId(event.kind, event.id);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    disabled: event.completed || isUnoErp
  });

  const [resizeDeltaPx, setResizeDeltaPx] = useState(0);
  const resizingRef = useRef(false);
  const startYRef = useRef(0);

  const top = ((minutesFromMidnight(event.start) - windowStartMinutes) / 60) * hourHeight;
  const baseHeight = Math.max(
    14,
    ((event.end.getTime() - event.start.getTime()) / 60_000 / 60) * hourHeight
  );
  const displayHeight = Math.max(14, baseHeight + resizeDeltaPx);

  const canResize = event.hasRealDuration && !event.completed && !isUnoErp;
  const unoErpBg = isUnoErp ? hexWithAlpha(event.color, "26") : undefined;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          ref={setNodeRef}
          {...(event.completed || isUnoErp ? {} : attributes)}
          {...(event.completed || isUnoErp ? {} : listeners)}
          onClick={(e) => e.stopPropagation()}
          style={{
            top,
            height: displayHeight,
            transform: transform ? CSS.Translate.toString(transform) : undefined,
            zIndex: isDragging ? 30 : 10,
            backgroundColor: unoErpBg,
            borderColor: isUnoErp ? (event.color ?? undefined) : undefined
          }}
          className={cn(
            "absolute inset-x-0.5 touch-manipulation select-none overflow-hidden rounded-md border px-1.5 py-0.5 text-[11px] leading-tight",
            isUnoErp
              ? !unoErpBg && "border-dashed border-slate-400/40 bg-slate-400/10 text-slate-700 dark:text-slate-300"
              : event.kind === "intervention"
                ? "border-primary/25 bg-primary/10 text-primary"
                : "border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-400",
            event.completed && "opacity-50 line-through",
            isDragging && "opacity-80 shadow-md"
          )}
        >
          {isUnoErp ? (
            <button
              type="button"
              onClick={() => onOpenUnoErp(event)}
              className="flex w-full items-center gap-1 truncate text-left font-medium"
            >
              <span className="shrink-0 rounded-sm bg-black/10 px-1 text-[9px] font-bold uppercase tracking-wide dark:bg-white/15">
                ERP
              </span>
              <span className="truncate">{event.title || "—"}</span>
            </button>
          ) : event.kind === "activity" ? (
            <button type="button" onClick={() => onOpenActivity(event.id)} className="block w-full truncate text-left font-medium">
              {event.title || "—"}
            </button>
          ) : (
            <Link href={event.href} className="block truncate font-medium">
              {event.title || "—"}
            </Link>
          )}
          {event.subtitle && <div className="truncate text-[10px] opacity-80">{event.subtitle}</div>}
          {canResize && (
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                resizingRef.current = true;
                startYRef.current = e.clientY;
              }}
              onPointerMove={(e) => {
                if (!resizingRef.current) return;
                setResizeDeltaPx(e.clientY - startYRef.current);
              }}
              onPointerUp={(e) => {
                if (!resizingRef.current) return;
                resizingRef.current = false;
                e.stopPropagation();
                const deltaMinutes = snapMinutes((resizeDeltaPx / hourHeight) * 60);
                setResizeDeltaPx(0);
                if (deltaMinutes !== 0) onResizeCommit(event.id, deltaMinutes);
              }}
              className="absolute inset-x-0 bottom-0 h-2 cursor-row-resize"
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="min-w-[280px] max-w-[400px]">
        <EventTooltipBody event={event} />
      </TooltipContent>
    </Tooltip>
  );
}

function DayColumn({
  day,
  events,
  workingHours,
  gridHeight,
  windowStartMinutes,
  windowEndMinutes,
  hourHeight,
  now,
  onResizeCommit,
  onOpenActivity,
  onOpenUnoErp,
  onRequestCreate
}: {
  day: Date;
  events: CalendarEvent[];
  workingHours: WorkingHoursConfig;
  gridHeight: number;
  windowStartMinutes: number;
  windowEndMinutes: number;
  hourHeight: number;
  now: Date;
  onResizeCommit: (id: string, deltaMinutes: number) => void;
  onOpenActivity: (id: string) => void;
  onOpenUnoErp: (event: CalendarEvent) => void;
  onRequestCreate: (d: Date) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(day) });
  const dayConfig = workingHours.days[weekdayMon0(day)];
  const workingRanges = dayConfig?.enabled ? dayWorkingRanges(dayConfig) : [];
  const hourCount = (windowEndMinutes - windowStartMinutes) / 60;

  const nowMinutes = minutesFromMidnight(now);
  const showNowLine =
    isSameDay(day, now) && nowMinutes >= windowStartMinutes && nowMinutes <= windowEndMinutes;
  const nowTop = ((nowMinutes - windowStartMinutes) / 60) * hourHeight;

  return (
    <div
      ref={setNodeRef}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const minutes = snapMinutes(((e.clientY - rect.top) / hourHeight) * 60) + windowStartMinutes;
        const d = new Date(day);
        d.setHours(0, Math.max(windowStartMinutes, Math.min(windowEndMinutes - 15, minutes)), 0, 0);
        onRequestCreate(d);
      }}
      className={cn("relative cursor-pointer border-l", isOver && "bg-primary/5")}
      style={{ height: gridHeight }}
    >
      {workingRanges.map((r, i) => (
        <div
          key={i}
          className="absolute inset-x-0 bg-primary/[0.04]"
          style={{
            top: ((r.start - windowStartMinutes) / 60) * hourHeight,
            height: ((r.end - r.start) / 60) * hourHeight
          }}
        />
      ))}
      {Array.from({ length: hourCount }, (_, h) => (
        <div key={h} className="absolute inset-x-0 border-t border-dashed border-muted" style={{ top: h * hourHeight }} />
      ))}
      {events.map((event) => (
        <EventBlock
          key={`${event.kind}-${event.id}`}
          event={event}
          windowStartMinutes={windowStartMinutes}
          hourHeight={hourHeight}
          onResizeCommit={onResizeCommit}
          onOpenActivity={onOpenActivity}
          onOpenUnoErp={onOpenUnoErp}
        />
      ))}
      {showNowLine && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 h-px bg-red-500"
          style={{ top: nowTop }}
        />
      )}
    </div>
  );
}

export function CalendarWeekView({
  cursor,
  onCursorChange,
  onOpenActivity,
  onOpenUnoErp,
  onRequestCreate,
  maxHeightClassName = "max-h-[36rem]",
  fitToWorkingHours = false
}: {
  cursor: Date;
  onCursorChange: (d: Date) => void;
  onOpenActivity: (id: string) => void;
  onOpenUnoErp: (event: CalendarEvent) => void;
  onRequestCreate: (d: Date) => void;
  /** Tailwind max-height class for the scrollable hour grid — ignored when `fitToWorkingHours` is set. */
  maxHeightClassName?: string;
  /**
   * Fit the whole working-hours window into whatever height the container
   * gives us (measured live, so resizing the container — e.g. a dashboard
   * widget — actually changes row density instead of just scrolling) rather
   * than the full 24h + fixed-size scroll used on the /agenda page.
   */
  fitToWorkingHours?: boolean;
}) {
  const t = useTranslations("agenda");
  const { toast } = useToast();
  const events = useCalendarEvents();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Start from the SSR-safe default (matches the server render); the real
  // configured hours are loaded client-side right after mount below.
  const [workingHours, setWorkingHours] = useState<WorkingHoursConfig>(DEFAULT_WORKING_HOURS);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const days = useMemo(() => getWeekDays(cursor), [cursor]);

  // Current-time indicator — recomputed every 60s so the line/dot creep down the grid live.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const cfg = loadWorkingHours();
    setWorkingHours(cfg);
    if (fitToWorkingHours) return;

    // If this week includes today, prioritize scrolling to the current time
    // (near the top of the viewport) over the working-hours window, so the
    // now-line is visible without the user having to scroll manually.
    const today = new Date();
    const showingCurrentWeek = days.some((d) => isSameDay(d, today));
    if (showingCurrentWeek) {
      const nowMinutes = minutesFromMidnight(today);
      const top = Math.max(0, (nowMinutes / 60) * DEFAULT_HOUR_HEIGHT - DEFAULT_HOUR_HEIGHT * 2);
      scrollRef.current?.scrollTo({ top });
      return;
    }

    const { startMinutes } = overallWorkingWindow(cfg);
    // A little headroom above the first working slot instead of cutting it off at the edge.
    const top = Math.max(0, (startMinutes / 60) * DEFAULT_HOUR_HEIGHT - DEFAULT_HOUR_HEIGHT / 2);
    scrollRef.current?.scrollTo({ top });
  }, [fitToWorkingHours, days]);

  // Measure the actual space we're given (e.g. a resizable dashboard widget)
  // so the grid can size each hour row to fill it instead of overflowing.
  useEffect(() => {
    if (!fitToWorkingHours) return;
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setMeasuredHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitToWorkingHours]);

  const { windowStartMinutes, windowEndMinutes } = useMemo(() => {
    if (!fitToWorkingHours) return { windowStartMinutes: 0, windowEndMinutes: 24 * 60 };
    const { startMinutes, endMinutes } = overallWorkingWindow(workingHours);
    const startHour = Math.max(0, Math.floor(startMinutes / 60));
    const endHour = Math.min(24, Math.ceil(endMinutes / 60));
    return endHour > startHour
      ? { windowStartMinutes: startHour * 60, windowEndMinutes: endHour * 60 }
      : { windowStartMinutes: 0, windowEndMinutes: 24 * 60 };
  }, [fitToWorkingHours, workingHours]);

  const hourCount = (windowEndMinutes - windowStartMinutes) / 60;
  const hourHeight =
    fitToWorkingHours && measuredHeight
      ? Math.min(MAX_FIT_HOUR_HEIGHT, Math.max(MIN_FIT_HOUR_HEIGHT, measuredHeight / hourCount))
      : DEFAULT_HOUR_HEIGHT;
  const gridHeight = hourCount * hourHeight;

  const nowMinutesForAxis = minutesFromMidnight(now);
  const showNowDot =
    days.some((d) => isSameDay(d, now)) &&
    nowMinutesForAxis >= windowStartMinutes &&
    nowMinutesForAxis <= windowEndMinutes;
  const nowTopForAxis = ((nowMinutesForAxis - windowStartMinutes) / 60) * hourHeight;

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events ?? []) {
      const key = dayKey(e.start);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const handleDragEnd = async (e: DragEndEvent) => {
    if (!e.over) return;
    const { kind, id } = parseDragId(String(e.active.id));
    if (kind === "unoerp") return;
    const original = (events ?? []).find((ev) => ev.kind === kind && ev.id === id);
    if (!original) return;

    const deltaMinutes = snapMinutes((e.delta.y / hourHeight) * 60);
    const targetKey = String(e.over.id);
    const [y, m, d] = targetKey.split("-").map(Number);
    const newStart = new Date(original.start);
    newStart.setFullYear(y, m - 1, d);
    newStart.setMinutes(newStart.getMinutes() + deltaMinutes);

    try {
      if (kind === "intervention") await moveInterventionById(id, newStart);
      else await moveActivityById(id, newStart);
    } catch (err: any) {
      toast({ title: t("toasts.moveFailedTitle"), description: err?.message ?? String(err), variant: "destructive" });
    }
  };

  const handleResizeCommit = async (id: string, deltaMinutes: number) => {
    const original = (events ?? []).find((ev) => ev.kind === "intervention" && ev.id === id);
    if (!original) return;
    const newEnd = new Date(original.end.getTime() + deltaMinutes * 60_000);
    try {
      await resizeInterventionById(id, newEnd);
    } catch (err: any) {
      toast({ title: t("toasts.resizeFailedTitle"), description: err?.message ?? String(err), variant: "destructive" });
    }
  };

  const weekdayLabels = t.raw("weekdaysShort") as string[];
  const first = days[0];
  const last = days[6];
  const label =
    first.getMonth() === last.getMonth()
      ? `${first.getDate()}–${last.getDate()} ${last.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`
      : `${first.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${last.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("space-y-2", fitToWorkingHours && "flex h-full min-h-0 flex-col space-y-1.5")}>
        <div className="shrink-0">
          <CalendarNavHeader
            label={label}
            onPrev={() => onCursorChange(addWeeks(cursor, -1))}
            onNext={() => onCursorChange(addWeeks(cursor, 1))}
            onToday={() => onCursorChange(new Date())}
          />
        </div>
        <div
          className={cn(
            "overflow-hidden rounded-xl border",
            fitToWorkingHours && "flex min-h-0 flex-1 flex-col"
          )}
        >
          <div className="grid shrink-0 grid-cols-[3rem_repeat(7,1fr)] border-b bg-muted/40 text-center">
            <div />
            {days.map((day, i) => (
              <div key={day.toISOString()} className="border-l py-1.5">
                <div className="text-[10px] uppercase text-muted-foreground">{weekdayLabels[i]}</div>
                <div
                  className={cn(
                    "mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                    isSameDay(day, new Date()) ? "bg-primary text-primary-foreground" : "text-foreground"
                  )}
                >
                  {day.getDate()}
                </div>
              </div>
            ))}
          </div>
          <DndContext sensors={sensors} onDragEnd={(e) => void handleDragEnd(e)}>
            <div
              ref={scrollRef}
              className={cn(
                "overflow-y-auto",
                fitToWorkingHours ? "min-h-0 flex-1" : maxHeightClassName
              )}
            >
              <div className="grid grid-cols-[3rem_repeat(7,1fr)]">
                <div className="relative" style={{ height: gridHeight }}>
                  {Array.from({ length: hourCount }, (_, i) => {
                    const h = windowStartMinutes / 60 + i;
                    return (
                      <div
                        key={h}
                        className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
                        style={{ top: i * hourHeight }}
                      >
                        {String(h).padStart(2, "0")}:00
                      </div>
                    );
                  })}
                  {showNowDot && (
                    <div
                      className="pointer-events-none absolute right-0.5 h-2 w-2 -translate-y-1/2 rounded-full bg-red-500"
                      style={{ top: nowTopForAxis }}
                    />
                  )}
                </div>
                {days.map((day) => (
                  <DayColumn
                    key={day.toISOString()}
                    day={day}
                    events={eventsByDay.get(dayKey(day)) ?? []}
                    workingHours={workingHours}
                    gridHeight={gridHeight}
                    windowStartMinutes={windowStartMinutes}
                    windowEndMinutes={windowEndMinutes}
                    hourHeight={hourHeight}
                    now={now}
                    onResizeCommit={(id, delta) => void handleResizeCommit(id, delta)}
                    onOpenActivity={onOpenActivity}
                    onOpenUnoErp={onOpenUnoErp}
                    onRequestCreate={onRequestCreate}
                  />
                ))}
              </div>
            </div>
          </DndContext>
        </div>
        {!fitToWorkingHours && <p className="text-xs text-muted-foreground">{t("create.slotHint")}</p>}
      </div>
    </TooltipProvider>
  );
}
