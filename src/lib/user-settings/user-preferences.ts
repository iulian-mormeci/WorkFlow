import { db, type UserSettings, type UserPreferences } from "@/lib/db/workflow-db";
import { cloneConfig, DEFAULT_WORKING_HOURS } from "@/lib/interventions/working-hours";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";

export function normalizeUserPreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  return {
    calendarAutoExportCompleted: o.calendarAutoExportCompleted === true
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
