/**
 * Personal working-hours model + smart timer math.
 *
 * Supports split shifts: each weekday holds multiple working `slots`
 * (e.g. 08:00–12:30 + 14:00–18:00) and optional `breaks` carved out of them
 * (e.g. lunch). Effective working time = union(slots) minus union(breaks),
 * intersected with the timer window.
 *
 * Storage is offline-first: Dexie `userSettings` syncs to `wf_user_settings` (Supabase)
 * with realtime. The timer reads a memory cache + localStorage mirror updated on
 * every pull, save, or realtime change.
 *
 * Keep these helpers deterministic: callers pass `now`/`stopAtMs` explicitly so
 * UI is testable and SSR-safe.
 */

/** Mon=0 .. Sun=6 (matches `days` array index). */
export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** A local `HH:mm`–`HH:mm` range (working slot or break). */
export type TimeRange = {
  start: string;
  end: string;
};

export type WorkingDay = {
  enabled: boolean;
  /** Working periods for the day (split shifts allowed). */
  slots: TimeRange[];
  /** Periods excluded from the slots above (e.g. lunch). */
  breaks: TimeRange[];
};

export type WorkingHoursConfig = {
  /** Exactly 7 entries, index 0=Monday .. 6=Sunday. */
  days: WorkingDay[];
  /** UI flag: edit each day independently vs one shared schedule. */
  perDay: boolean;
};

export const WORKING_HOURS_STORAGE_KEY = "workflow:workingHours:v1";

const MORNING: TimeRange = { start: "08:00", end: "12:30" };
const AFTERNOON: TimeRange = { start: "14:00", end: "18:00" };

function weekdayTemplate(enabled: boolean): WorkingDay {
  return {
    enabled,
    slots: [{ ...MORNING }, { ...AFTERNOON }],
    breaks: []
  };
}

export const DEFAULT_WORKING_HOURS: WorkingHoursConfig = {
  perDay: false,
  days: [
    weekdayTemplate(true), // Mon
    weekdayTemplate(true), // Tue
    weekdayTemplate(true), // Wed
    weekdayTemplate(true), // Thu
    weekdayTemplate(true), // Fri
    weekdayTemplate(false), // Sat
    weekdayTemplate(false) // Sun
  ]
};

const HHMM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function cloneRange(r: TimeRange): TimeRange {
  return { start: r.start, end: r.end };
}

function cloneDay(d: WorkingDay): WorkingDay {
  return { enabled: d.enabled, slots: d.slots.map(cloneRange), breaks: d.breaks.map(cloneRange) };
}

export function cloneConfig(cfg: WorkingHoursConfig): WorkingHoursConfig {
  return { perDay: cfg.perDay, days: cfg.days.map(cloneDay) };
}

/** `"08:30"` -> 510 minutes; `null` when malformed. */
export function hhmmToMinutes(value: string): number | null {
  if (typeof value !== "string" || !HHMM_RE.test(value)) return null;
  const [h, m] = value.split(":").map((v) => Number(v));
  return h * 60 + m;
}

export function minutesToHhmm(total: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function isValidHhmm(value: unknown): value is string {
  return typeof value === "string" && HHMM_RE.test(value);
}

/** Keep only well-formed, positive-length ranges. Returns null if not an array. */
function sanitizeRanges(value: unknown): TimeRange[] | null {
  if (!Array.isArray(value)) return null;
  const out: TimeRange[] = [];
  for (const r of value) {
    if (!r || typeof r !== "object") continue;
    const { start, end } = r as Partial<TimeRange>;
    if (isValidHhmm(start) && isValidHhmm(end)) out.push({ start, end });
  }
  return out;
}

/**
 * Coerce arbitrary stored/cloud JSON into a valid config (always 7 days).
 * Migrates the legacy single `{ start, end }` per-day shape into one slot.
 */
export function normalizeWorkingHours(raw: unknown): WorkingHoursConfig {
  if (!raw || typeof raw !== "object") return cloneConfig(DEFAULT_WORKING_HOURS);
  const obj = raw as { days?: unknown; perDay?: unknown };
  const rawDays = Array.isArray(obj.days) ? obj.days : [];
  const days: WorkingDay[] = DEFAULT_WORKING_HOURS.days.map((def, i) => {
    const d = rawDays[i] as
      | (Partial<WorkingDay> & { start?: unknown; end?: unknown })
      | undefined;
    if (!d || typeof d !== "object") return cloneDay(def);
    const enabled = typeof d.enabled === "boolean" ? d.enabled : def.enabled;
    let slots = sanitizeRanges(d.slots);
    if (slots === null) {
      // Legacy shape: a single start/end pair.
      slots = isValidHhmm(d.start) && isValidHhmm(d.end) ? [{ start: d.start, end: d.end }] : null;
    }
    if (slots === null) slots = def.slots.map(cloneRange);
    const breaks = sanitizeRanges(d.breaks) ?? [];
    return { enabled, slots, breaks };
  });
  return { perDay: obj.perDay === true, days };
}

/** Read config for timer stop (sync): memory cache → localStorage → defaults. */
export function loadWorkingHours(): WorkingHoursConfig {
  if (workingHoursMemoryCache) return workingHoursMemoryCache;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(WORKING_HOURS_STORAGE_KEY);
      if (raw) return normalizeWorkingHours(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }
  return cloneConfig(DEFAULT_WORKING_HOURS);
}

export function saveWorkingHoursLocal(cfg: WorkingHoursConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORKING_HOURS_STORAGE_KEY, JSON.stringify(normalizeWorkingHours(cfg)));
  } catch {
    /* private mode / quota — in-memory state still works for this session */
  }
}

/** In-memory copy for synchronous timer reads; updated on sync/save. */
let workingHoursMemoryCache: WorkingHoursConfig | null = null;

export function getWorkingHoursMemoryCache(): WorkingHoursConfig | null {
  return workingHoursMemoryCache;
}

export function setWorkingHoursMemoryCache(cfg: WorkingHoursConfig): WorkingHoursConfig {
  const next = normalizeWorkingHours(cfg);
  workingHoursMemoryCache = next;
  saveWorkingHoursLocal(next);
  return next;
}

export function clearWorkingHoursMemoryCache(): void {
  workingHoursMemoryCache = null;
}

/** Mon=0 .. Sun=6 from a Date (JS `getDay()` is Sun=0). */
function weekdayMon0(d: Date): number {
  return (d.getDay() + 6) % 7;
}

type Interval = { s: number; e: number };

/** Absolute ms for `minutes` past local midnight of `base` (DST-safe). */
function atMinutes(base: Date, minutes: number): number {
  const d = new Date(base);
  d.setHours(0, minutes, 0, 0);
  return d.getTime();
}

function mergeIntervals(list: Interval[]): Interval[] {
  if (list.length <= 1) return list.slice();
  const sorted = [...list].sort((a, b) => a.s - b.s);
  const out: Interval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    if (sorted[i].s <= last.e) last.e = Math.max(last.e, sorted[i].e);
    else out.push({ ...sorted[i] });
  }
  return out;
}

/** Remove `cuts` from `base`, splitting intervals as needed. */
function subtractIntervals(base: Interval[], cuts: Interval[]): Interval[] {
  if (cuts.length === 0) return base.slice();
  const result: Interval[] = [];
  for (const b of base) {
    let segments: Interval[] = [{ s: b.s, e: b.e }];
    for (const c of cuts) {
      const next: Interval[] = [];
      for (const seg of segments) {
        if (c.e <= seg.s || c.s >= seg.e) {
          next.push(seg);
          continue;
        }
        if (c.s > seg.s) next.push({ s: seg.s, e: Math.min(c.s, seg.e) });
        if (c.e < seg.e) next.push({ s: Math.max(c.e, seg.s), e: seg.e });
      }
      segments = next;
    }
    result.push(...segments);
  }
  return result;
}

function sumLength(list: Interval[]): number {
  return list.reduce((acc, i) => acc + Math.max(0, i.e - i.s), 0);
}

/** Build a day's net working intervals (slots − breaks) clipped to the window. */
function dayNetIntervals(day: WorkingDay, base: Date, windowStart: number, windowEnd: number): Interval[] {
  const working: Interval[] = [];
  for (const slot of day.slots) {
    const sm = hhmmToMinutes(slot.start);
    const em = hhmmToMinutes(slot.end);
    if (sm == null || em == null || em <= sm) continue;
    const oS = Math.max(windowStart, atMinutes(base, sm));
    const oE = Math.min(windowEnd, atMinutes(base, em));
    if (oE > oS) working.push({ s: oS, e: oE });
  }
  if (working.length === 0) return [];
  const breaks: Interval[] = [];
  for (const br of day.breaks) {
    const sm = hhmmToMinutes(br.start);
    const em = hhmmToMinutes(br.end);
    if (sm == null || em == null || em <= sm) continue;
    const oS = Math.max(windowStart, atMinutes(base, sm));
    const oE = Math.min(windowEnd, atMinutes(base, em));
    if (oE > oS) breaks.push({ s: oS, e: oE });
  }
  return subtractIntervals(mergeIntervals(working), mergeIntervals(breaks));
}

/**
 * Seconds of [startMs, endMs] that fall inside configured working slots
 * (minus breaks), summed across each local calendar day in the range.
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
    if (day?.enabled) totalMs += sumLength(dayNetIntervals(day, cursor, startMs, endMs));
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.floor(totalMs / 1000);
}

/** Net scheduled minutes for a single day (slots − breaks), ignoring any window. */
export function dayScheduledMinutes(day: WorkingDay): number {
  const working: Interval[] = [];
  for (const slot of day.slots) {
    const sm = hhmmToMinutes(slot.start);
    const em = hhmmToMinutes(slot.end);
    if (sm != null && em != null && em > sm) working.push({ s: sm, e: em });
  }
  if (working.length === 0) return 0;
  const breaks: Interval[] = [];
  for (const br of day.breaks) {
    const sm = hhmmToMinutes(br.start);
    const em = hhmmToMinutes(br.end);
    if (sm != null && em != null && em > sm) breaks.push({ s: sm, e: em });
  }
  return sumLength(subtractIntervals(mergeIntervals(working), mergeIntervals(breaks)));
}

export type TimerStopAnalysis = {
  trackedSeconds: number;
  withinSeconds: number;
  outsideSeconds: number;
  windowStartMs: number;
  windowEndMs: number;
};

/**
 * Split tracked timer seconds into "inside working slots" vs "outside" (breaks
 * and non-working time), modeling the work as a contiguous block ending at
 * `stopAtMs` (timer already excludes its own pauses). Catches the common
 * inflation case: a timer left running into a break, the evening or a weekend.
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
