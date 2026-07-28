import type { UnoErpRawActivity } from "@/lib/unoerp/client";

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

  const day = new Date(dalNum * 1000);
  const startTime = parseHHMM(raw.dalle);
  const endTime = parseHHMM(raw.alle);

  let startAt: Date;
  let endAt: Date;
  let allDay = false;

  if (!startTime) {
    allDay = true;
    startAt = new Date(day);
    startAt.setHours(0, 0, 0, 0);
    endAt = new Date(startAt);
    endAt.setDate(endAt.getDate() + 1);
  } else {
    startAt = new Date(day);
    startAt.setHours(startTime.hours, startTime.minutes, 0, 0);
    if (endTime) {
      endAt = new Date(day);
      endAt.setHours(endTime.hours, endTime.minutes, 0, 0);
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
