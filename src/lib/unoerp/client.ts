const UNOERP_CALL_TIMEOUT_MS = 30_000;
const PAGE_PAUSE_MS = 300;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type UnoErpAuthResult =
  | { ok: true; auth: string; uid: string }
  | { ok: false; error: string };

/**
 * NOTE: the auth request shape (Basic auth, no extra params) follows exactly
 * what was specified — UnoERP's `intranet/api.php` hasn't been directly
 * inspected here, so if the real instance expects additional parameters this
 * is the first place to adjust once `/api/unoerp/connect` is exercised
 * against a live instance.
 */
export async function authenticateUnoErp(
  baseUrl: string,
  username: string,
  password: string
): Promise<UnoErpAuthResult> {
  const basic = Buffer.from(`${username}:${password}`).toString("base64");
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/intranet/api.php`,
      { method: "POST", headers: { Authorization: `Basic ${basic}` } },
      UNOERP_CALL_TIMEOUT_MS
    );
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const body = (await res.json().catch(() => null)) as { auth?: string; uid?: string } | null;
    if (!body?.auth) return { ok: false, error: "auth_failed" };
    return { ok: true, auth: body.auth, uid: String(body.uid ?? "") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network_error" };
  }
}

export type UnoErpRawActivity = Record<string, unknown>;

async function fetchAttivitaPage(
  baseUrl: string,
  auth: string,
  page: number
): Promise<{ rows: UnoErpRawActivity[]; totalPages: number }> {
  const params = new URLSearchParams();
  params.set("auth", auth);
  params.set("act", "index");
  params.set("module", "Risorse");
  params.set("file", "attivita_da_lavorare");
  if (page > 1) params.set("pages[mie__programmate]", String(page));

  const res = await fetchWithTimeout(
    `${baseUrl}/intranet/api.php`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    },
    UNOERP_CALL_TIMEOUT_MS
  );
  if (!res.ok) throw new Error(`UnoERP HTTP ${res.status}`);
  const body = (await res.json()) as {
    data?: { mie__programmate?: UnoErpRawActivity[] };
    tot_pagine?: { mie__programmate?: number | string };
  };
  const rows = body.data?.mie__programmate ?? [];
  const totalPages = Number(body.tot_pagine?.mie__programmate ?? 1) || 1;
  return { rows, totalPages };
}

/**
 * Fetch every page of the `mie__programmate` section only — every other
 * section in the response (ticket, altri__programmate, non_assegnate, ecc.)
 * is ignored entirely, per the integration's scope.
 */
export async function fetchAllMieProgrammate(baseUrl: string, auth: string): Promise<UnoErpRawActivity[]> {
  const all: UnoErpRawActivity[] = [];
  let page = 1;
  for (;;) {
    const { rows, totalPages } = await fetchAttivitaPage(baseUrl, auth, page);
    all.push(...rows);
    if (page >= totalPages) break;
    page += 1;
    await new Promise((resolve) => setTimeout(resolve, PAGE_PAUSE_MS));
  }
  return all;
}
