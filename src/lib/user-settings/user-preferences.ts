import { db, type UserSettings, type UserPreferences, type DashboardWidgetPref } from "@/lib/db/workflow-db";
import { cloneConfig, DEFAULT_WORKING_HOURS } from "@/lib/interventions/working-hours";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function normalizeDashboardWidgets(raw: unknown): DashboardWidgetPref[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DashboardWidgetPref[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id === "string" && e.id) {
      out.push({
        id: e.id,
        visible: e.visible !== false,
        x: num(e.x),
        y: num(e.y),
        w: num(e.w),
        h: num(e.h)
      });
    }
  }
  return out.length ? out : undefined;
}

export function normalizeUserPreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  return {
    calendarAutoExportCompleted: o.calendarAutoExportCompleted === true,
    menuToCsvPluStart: typeof o.menuToCsvPluStart === "number" ? o.menuToCsvPluStart : undefined,
    menuToCsvDuplicateDesc: o.menuToCsvDuplicateDesc === true,
    menuToCsvSeparator: typeof o.menuToCsvSeparator === "string" ? o.menuToCsvSeparator : undefined,
    menuToCsvEncoding: o.menuToCsvEncoding === "utf8" || o.menuToCsvEncoding === "utf8bom"
      ? o.menuToCsvEncoding
      : undefined,
    dashboardWidgets: normalizeDashboardWidgets(o.dashboardWidgets)
  };
}

export async function getUserPreferences(userId?: string): Promise<UserPreferences> {
  if (!userId) return {};
  const row = await db.userSettings.get(userId);
  return row?.preferences ?? {};
}

export async function saveUserPreferences(
  userId: string,
  patch: Partial<UserPreferences>
): Promise<UserSettings> {
  const nowIso = new Date().toISOString();
  const existing = await db.userSettings.get(userId);
  const preferences: UserPreferences = {
    ...(existing?.preferences ?? {}),
    ...patch
  };
  const row: UserSettings = {
    id: userId,
    workingHours: existing?.workingHours ?? cloneConfig(DEFAULT_WORKING_HOURS),
    preferences,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
    syncedAt: existing?.syncedAt
  };
  await db.userSettings.put(row);
  scheduleWorkflowSync();
  return row;
}
