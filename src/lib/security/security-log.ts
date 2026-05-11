/**
 * Lightweight security audit trail: single-line JSON to stdout (Edge + Node).
 * Collectable by Vercel/Fly/host logs or log drains. No PII beyond IP for abuse tracing.
 *
 * Disable entirely: `WORKFLOW_SECURITY_LOG=0` in env.
 */

function loggingEnabled(): boolean {
  return process.env.WORKFLOW_SECURITY_LOG !== "0";
}

export function logSecurityEvent(payload: Record<string, unknown>): void {
  if (!loggingEnabled()) return;
  try {
    const line = JSON.stringify({
      source: "workflow-security",
      ts: new Date().toISOString(),
      ...payload
    });
    console.warn(`[workflow-security] ${line}`);
  } catch {
    /* ignore serialization errors */
  }
}
