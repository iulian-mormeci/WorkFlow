import type { UnoErpRawActivity } from "@/lib/unoerp/client";
import { zonedTimeToUtc, zonedYearMonthDay } from "@/lib/unoerp/timezone";

/**
 * UnoERP's `dal`/`dalle`/`alle` are always Italian wall-clock time (the ERP's
 * own time zone), independent of whatever time zone the app displays dates
 * in for a given user — so this is fixed, not read from app config.
 */
const UNOERP_TIME_ZONE = "Europe/Rome";

export type MappedUnoErpEvent = {
  unoerpId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  description?: string;
  subtitle?: string;
  color?: string;
  category?: string;
  priority?: string;
  ticketType?: string;
};

/** "1730" -> {hours:17, minutes:30}; "" / "0" -> null (all-day marker). */
function parseHHMM(raw: unknown): { hours: number; minutes: number } | null {
  const s = String(raw ?? "").trim();
  if (!s || s === "0") return null;
  const padded = s.padStart(4, "0");
  const hours = Number(padded.slice(0, 2));
  const minutes = Number(padded.slice(2, 4));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return { hours, minutes };
}

function str(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
  return s ? s : undefined;
}

/**
 * Maps one raw UnoERP `mie__programmate` row to a calendar-ready event.
 * Returns null for rows that must be skipped entirely: no `dal` (unscheduled)
 * or no `id_prot` (can't be deduped/tracked).
 */
export function mapUnoErpActivity(raw: UnoErpRawActivity): MappedUnoErpEvent | null {
  const dalRaw = raw.dal;
  if (dalRaw == null || dalRaw === 0 || String(dalRaw) === "0" || String(dalRaw).trim() === "") return null;
  const dalNum = Number(dalRaw);
  if (!Number.isFinite(dalNum) || dalNum <= 0) return null;

  const unoerpId = str(raw.id_prot);
  if (!unoerpId) return null;

  // `dal` is a Unix timestamp for midnight of that day *in Italian time* —
  // reading Y/M/D via the Rome time zone (not the server's own) is what
  // keeps this correct regardless of what time zone the server itself runs in.
  const { year, month, day } = zonedYearMonthDay(new Date(dalNum * 1000), UNOERP_TIME_ZONE);
  const startTime = parseHHMM(raw.dalle);
  const endTime = parseHHMM(raw.alle);

  let startAt: Date;
  let endAt: Date;
  let allDay = false;

  if (!startTime) {
    allDay = true;
    startAt = zonedTimeToUtc(year, month, day, 0, 0, UNOERP_TIME_ZONE);
    endAt = zonedTimeToUtc(year, month, day + 1, 0, 0, UNOERP_TIME_ZONE);
  } else {
    startAt = zonedTimeToUtc(year, month, day, startTime.hours, startTime.minutes, UNOERP_TIME_ZONE);
    if (endTime) {
      endAt = zonedTimeToUtc(year, month, day, endTime.hours, endTime.minutes, UNOERP_TIME_ZONE);
      if (endAt.getTime() <= startAt.getTime()) endAt = new Date(startAt.getTime() + 60 * 60_000);
    } else {
      endAt = new Date(startAt.getTime() + 60 * 60_000);
    }
  }

  return {
    unoerpId,
    title: str(raw.oggetto) ?? "",
    startAt,
    endAt,
    allDay,
    description: str(raw.note),
    subtitle: str(raw.anagrafica),
    color: str(raw.color),
    category: str(raw.categoria),
    priority: str(raw.txt_priorita),
    ticketType: str(raw.ticket_type_desc)
  };
}
