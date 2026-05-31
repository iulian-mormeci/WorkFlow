/**
 * Personal working-hours model + smart timer math.
 *
 * Storage is offline-first: localStorage is the source of truth the timer reads
 * synchronously, and the Settings page mirrors it into Supabase user metadata
 * for cross-device hydration. No table/migration is required.
 *
 * Keep these helpers deterministic: callers pass `now`/`stopAtMs` explicitly so
 * UI is testable and SSR-safe.
 */

/** Mon=0 .. Sun=6 (matches `days` array index). */
export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export type WorkingDay = {
  enabled: boolean;
  /** Local `HH:mm`. */
  start: string;
  /** Local `HH:mm`. */
  end: string;
};

export type WorkingHoursConfig = {
  /** Exactly 7 entries, index 0=Monday .. 6=Sunday. */
  days: WorkingDay[];
  /** UI flag: edit each day independently vs a single shared start/end. */
  perDay: boolean;
};

export const WORKING_HOURS_STORAGE_KEY = "workflow:workingHours:v1";

const DEFAULT_START = "08:00";
const DEFAULT_END = "17:00";

export const DEFAULT_WORKING_HOURS: WorkingHoursConfig = {
  perDay: false,
  days: [
    { enabled: true, start: DEFAULT_START, end: DEFAULT_END }, // Mon
    { enabled: true, start: DEFAULT_START, end: DEFAULT_END }, // Tue
    { enabled: true, start: DEFAULT_START, end: DEFAULT_END }, // Wed
    { enabled: true, start: DEFAULT_START, end: DEFAULT_END }, // Thu
    { enabled: true, start: DEFAULT_START, end: DEFAULT_END }, // Fri
    { enabled: false, start: DEFAULT_START, end: "13:00" }, // Sat
    { enabled: false, start: DEFAULT_START, end: "13:00" } // Sun
  ]
};

const HHMM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function cloneConfig(cfg: WorkingHoursConfig): WorkingHoursConfig {
  return { perDay: cfg.perDay, days: cfg.days.map((d) => ({ ...d })) };
}

/** `"08:30"` -> 510 minutes; `null` when malformed. */
export function hhmmToMinutes(value: string): number | null {
  if (typeof value !== "string" || !HHMM_RE.test(value)) return null;
  const [h, m] = value.split(":").map((v) => Number(v));
  return h * 60 + m;
}

function sanitizeHhmm(value: unknown, fallback: string): string {
  return typeof value === "string" && HHMM_RE.test(value) ? value : fallback;
}

/** Coerce arbitrary stored/cloud JSON into a valid config (always 7 days). */
export function normalizeWorkingHours(raw: unknown): WorkingHoursConfig {
  if (!raw || typeof raw !== "object") return cloneConfig(DEFAULT_WORKING_HOURS);
  const obj = raw as { days?: unknown; perDay?: unknown };
  const rawDays = Array.isArray(obj.days) ? obj.days : [];
  const days: WorkingDay[] = DEFAULT_WORKING_HOURS.days.map((def, i) => {
    const d = rawDays[i] as Partial<WorkingDay> | undefined;
    if (!d || typeof d !== "object") return { ...def };
    return {
      enabled: typeof d.enabled === "boolean" ? d.enabled : def.enabled,
      start: sanitizeHhmm(d.start, def.start),
      end: sanitizeHhmm(d.end, def.end)
    };
  });
  return { perDay: obj.perDay === true, days };
}

/** Read the locally persisted config (offline-first); falls back to defaults. */
export function loadWorkingHours(): WorkingHoursConfig {
  if (typeof window === "undefined") return cloneConfig(DEFAULT_WORKING_HOURS);
  try {
    const raw = window.localStorage.getItem(WORKING_HOURS_STORAGE_KEY);
    if (!raw) return cloneConfig(DEFAULT_WORKING_HOURS);
    return normalizeWorkingHours(JSON.parse(raw));
  } catch {
    return cloneConfig(DEFAULT_WORKING_HOURS);
  }
}

export function saveWorkingHoursLocal(cfg: WorkingHoursConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORKING_HOURS_STORAGE_KEY, JSON.stringify(normalizeWorkingHours(cfg)));
  } catch {
    /* private mode / quota — in-memory state still works for this session */
  }
}

/** Mon=0 .. Sun=6 from a Date (JS `getDay()` is Sun=0). */
function weekdayMon0(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/**
 * Seconds of [startMs, endMs] that fall inside configured working windows,
 * summed across each local calendar day in the range (enabled days only).
 */
export function computeWorkingOverlapSeconds(
  startMs: number,
  endMs: number,
  cfg: WorkingHoursConfig
): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  const config = normalizeWorkingHours(cfg);
  let totalMs = 0;
  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);
  // Guard against pathological ranges (e.g. corrupt timer): cap at ~1 year.
  for (let i = 0; i < 400 && cursor.getTime() <= endMs; i++) {
    const day = config.days[weekdayMon0(cursor)];
    if (day?.enabled) {
      const sm = hhmmToMinutes(day.start);
      const em = hhmmToMinutes(day.end);
      if (sm != null && em != null && em > sm) {
        const ws = new Date(cursor);
        ws.setHours(0, sm, 0, 0);
        const we = new Date(cursor);
        we.setHours(0, em, 0, 0);
        const oStart = Math.max(startMs, ws.getTime());
        const oEnd = Math.min(endMs, we.getTime());
        if (oEnd > oStart) totalMs += oEnd - oStart;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.floor(totalMs / 1000);
}

export type TimerStopAnalysis = {
  trackedSeconds: number;
  withinSeconds: number;
  outsideSeconds: number;
  windowStartMs: number;
  windowEndMs: number;
};

/**
 * Split tracked timer seconds into "inside working hours" vs "outside", modeling
 * the work as a contiguous block ending at `stopAtMs` (timer already excludes
 * pauses). This catches the common inflation case: a timer left running into the
 * evening or weekend.
 */
export function analyzeTimerStop(params: {
  trackedSeconds: number;
  stopAtMs?: number;
  config: WorkingHoursConfig;
}): TimerStopAnalysis {
  const tracked = Math.max(0, Math.floor(params.trackedSeconds));
  const end = params.stopAtMs ?? Date.now();
  const start = end - tracked * 1000;
  const within = Math.min(tracked, computeWorkingOverlapSeconds(start, end, params.config));
  return {
    trackedSeconds: tracked,
    withinSeconds: within,
    outsideSeconds: Math.max(0, tracked - within),
    windowStartMs: start,
    windowEndMs: end
  };
}

/** Duration of an `HH:mm`-`HH:mm` range in seconds; wraps past midnight. */
export function overtimeSecondsFromRange(start: string, end: string): number {
  const sm = hhmmToMinutes(start);
  const em = hhmmToMinutes(end);
  if (sm == null || em == null) return 0;
  let diff = em - sm;
  if (diff <= 0) diff += 24 * 60; // crosses midnight
  return Math.min(diff, 24 * 60) * 60;
}

/** Whole-minute `{ h, m }` breakdown for localized "Xh Ym" rendering. */
export function secondsToHm(totalSeconds: number): { h: number; m: number } {
  const m = Math.max(0, Math.round(totalSeconds / 60));
  return { h: Math.floor(m / 60), m: m % 60 };
}

/** `HH:mm` (local) for a given instant. */
export function msToLocalHhmm(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
