import type { UnoErpCalendarEvent } from "@/stores/unoerp-events";
import type { CalendarEvent } from "@/lib/calendar/use-calendar-events";

/** Adapts a synced UnoERP event to the shared `CalendarEvent` shape used by every agenda view. */
export function unoErpToCalendarEvent(e: UnoErpCalendarEvent): CalendarEvent {
  return {
    id: e.id,
    kind: "unoerp",
    title: e.title,
    subtitle: e.subtitle,
    description: e.description,
    start: e.start,
    end: e.end,
    hasRealDuration: false,
    completed: false,
    href: "",
    allDay: e.allDay,
    color: e.color,
    category: e.category,
    priority: e.priority,
    ticketType: e.ticketType
  };
}
