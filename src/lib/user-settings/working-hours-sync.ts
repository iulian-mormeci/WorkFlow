/**
 * Keeps Dexie user settings and the working-hours memory cache aligned with the cloud.
 */
import { db, type UserSettings } from "@/lib/db/workflow-db";
import {
  DEFAULT_WORKING_HOURS,
  cloneConfig,
  loadWorkingHours,
  normalizeWorkingHours,
  setWorkingHoursMemoryCache,
  type WorkingHoursConfig
} from "@/lib/interventions/working-hours";

export function applyWorkingHoursFromUserSettingsRow(row: UserSettings): void {
  setWorkingHoursMemoryCache(row.workingHours);
}

export async function resolveWorkingHours(userId?: string): Promise<WorkingHoursConfig> {
  if (userId) {
    const row = await db.userSettings.get(userId);
    if (row?.workingHours) {
      return setWorkingHoursMemoryCache(row.workingHours);
    }
  }
  return setWorkingHoursMemoryCache(loadWorkingHours());
}

export async function ensureUserSettingsRow(
  userId: string,
  options?: { seedFromLocalStorage?: boolean; legacyMetadata?: unknown }
): Promise<UserSettings> {
  const existing = await db.userSettings.get(userId);
  if (existing) {
    applyWorkingHoursFromUserSettingsRow(existing);
    return existing;
  }

  const nowIso = new Date().toISOString();
  let workingHours = cloneConfig(DEFAULT_WORKING_HOURS);

  if (options?.legacyMetadata && typeof options.legacyMetadata === "object") {
    workingHours = normalizeWorkingHours(options.legacyMetadata);
  } else if (options?.seedFromLocalStorage !== false) {
    workingHours = loadWorkingHours();
  }

  const row: UserSettings = {
    id: userId,
    workingHours,
    createdAt: nowIso,
    updatedAt: nowIso
  };
  await db.userSettings.put(row);
  applyWorkingHoursFromUserSettingsRow(row);
  return row;
}

export async function saveUserWorkingHours(
  userId: string,
  cfg: WorkingHoursConfig
): Promise<UserSettings> {
  const next = normalizeWorkingHours(cfg);
  const nowIso = new Date().toISOString();
  const existing = await db.userSettings.get(userId);
  const row: UserSettings = {
    id: userId,
    workingHours: next,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
    syncedAt: existing?.syncedAt
  };
  await db.userSettings.put(row);
  setWorkingHoursMemoryCache(next);
  return row;
}
