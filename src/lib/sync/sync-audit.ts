/**
 * Optional client-side sync audit trail (enable with NEXT_PUBLIC_SYNC_AUDIT=1).
 */
const enabled =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_SYNC_AUDIT === "1";

export function syncAuditLog(
  event: string,
  detail?: Record<string, unknown>
): void {
  if (!enabled) return;
  const line = { t: new Date().toISOString(), event, ...detail };
  try {
    console.info("[sync-audit]", line);
  } catch {
    // ignore
  }
}
