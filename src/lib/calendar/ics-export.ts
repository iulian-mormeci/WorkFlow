export type CalendarEventInput = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format local wall time for ICS (floating, no TZ suffix). */
function formatIcsLocal(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function formatIcsDateOnly(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function buildIcs(event: CalendarEventInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WorkFlow//Calendar Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(event.uid)}@workflow.app`,
    `DTSTAMP:${formatIcsLocal(new Date())}`,
    `SUMMARY:${escapeIcs(event.title)}`
  ];

  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDateOnly(event.start)}`);
    const endDay = new Date(event.end);
    endDay.setDate(endDay.getDate() + 1);
    lines.push(`DTEND;VALUE=DATE:${formatIcsDateOnly(endDay)}`);
  } else {
    lines.push(`DTSTART:${formatIcsLocal(event.start)}`);
    lines.push(`DTEND:${formatIcsLocal(event.end)}`);
  }

  if (event.description) lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function downloadIcsFile(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Google Calendar “create event” web intent (UTC timestamps). */
export function googleCalendarUrl(event: CalendarEventInput): string {
  const fmtUtc = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${fmtUtc(event.start)}/${fmtUtc(event.end)}`
  });
  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function openGoogleCalendar(event: CalendarEventInput): void {
  window.open(googleCalendarUrl(event), "_blank", "noopener,noreferrer");
}

/** Apple Calendar opens downloaded ICS reliably; also supports webcal/data links on iOS. */
export function openAppleCalendarDownload(filename: string, ics: string): void {
  downloadIcsFile(filename, ics);
}
