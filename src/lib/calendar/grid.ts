import { startOfDay } from "@/lib/dates";

/** Monday-first week, matching the Italian locale this app primarily targets. */
const WEEK_START_DAY = 1; // 0 = Sunday, 1 = Monday

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** Start of the Monday-first week containing `d`. */
export function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = (day - WEEK_START_DAY + 7) % 7;
  return startOfDay(addDays(d, -diff));
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** yyyy-mm-dd in local time (not UTC) — safe key for day-bucket maps. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 7 days (Mon–Sun) for the week containing `d`. */
export function getWeekDays(d: Date): Date[] {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * Weeks × 7 days grid for the month containing `d`, including the leading/
 * trailing days from adjacent months needed to fill complete weeks
 * (always 5 or 6 rows, like every consumer calendar app).
 */
export function getMonthGrid(d: Date): Date[][] {
  const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  const start = startOfWeek(firstOfMonth);
  const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const end = startOfWeek(lastOfMonth);
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 7;
  const weeks: Date[][] = [];
  for (let w = 0; w < totalDays / 7; w++) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
  }
  return weeks;
}

/** First-of-month Date for each of the 12 months in the year containing `d`. */
export function getYearMonths(d: Date): Date[] {
  return Array.from({ length: 12 }, (_, m) => new Date(d.getFullYear(), m, 1));
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

export function addWeeks(d: Date, weeks: number): Date {
  return addDays(d, weeks * 7);
}

export function addYears(d: Date, years: number): Date {
  return new Date(d.getFullYear() + years, d.getMonth(), d.getDate());
}
