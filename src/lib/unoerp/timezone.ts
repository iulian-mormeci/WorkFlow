/**
 * UnoERP's `dal` timestamp marks midnight of a given calendar day as observed
 * in the app's configured time zone (Europe/Rome for an Italian ERP), not the
 * server's own system time zone. Plain `Date.setHours()` operates in
 * whatever time zone the Node process itself runs in — on a server set to
 * UTC, that silently shifts everything back to the previous day for any
 * time zone ahead of UTC (e.g. midnight CEST is 22:00 UTC the day before).
 * These helpers make the conversion explicit instead of relying on the
 * server's local time zone matching the data's.
 */

/** Offset (minutes) of `timeZone` from UTC at the instant `date` represents. */
function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** The Y/M/D of `date` as observed in `timeZone` (not the server's own time zone). */
export function zonedYearMonthDay(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

/** Converts a Y/M/D + H:m wall-clock time in `timeZone` to the correct absolute UTC instant. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string
): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - offsetMinutes * 60_000);
}
