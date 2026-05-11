# Supabase & app security — checklist (WorkFlow)

WorkFlow is a **personal** but **publicly reachable** PWA. Use this list with the in-app protections (CSP, HSTS, Edge rate limits, RLS) described in the repo **`README.md`**.

---

## Level 1 — Authentication & sessions

Apply in [Supabase Dashboard](https://supabase.com/dashboard) → your project.

### 1.1 URLs and providers

- **Authentication** → **URL configuration**: set **Site URL** to your production origin (`https://…`).
- Add **Redirect URLs** for local dev and production (OAuth / magic links / email confirm).
- Review **Sign in / providers** (email, Google, Apple, etc.) and disable what you do not use.

### 1.2 Refresh tokens (high impact)

- Enable **refresh token reuse detection** (wording may vary: e.g. detect reused refresh tokens and revoke sessions).
- Enable **refresh token rotation** if shown as a separate option.
- Keep **JWT expiry** for access tokens at a sensible default; shorter access tokens mean more refresh traffic but smaller theft window.

After changes, sign out everywhere once and sign back in to validate cookies.

### 1.3 API keys

| Key            | Where to use |
|----------------|--------------|
| **anon**       | Browser, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, middleware/RSC with **user** session only. |
| **service_role** | **Server-only** secrets (never `NEXT_PUBLIC_*`, never bundled client code). Use for admin scripts, migrations, or Edge Functions that **must** bypass RLS. |

If a `service_role` key ever leaks, **rotate it immediately** in Dashboard → Settings → API.

---

## Level 1 — Database (RLS)

- **Table Editor** → each `wf_*` table: confirm **RLS enabled** (migrations `001`, `010`, audit `012`).
- Policies must enforce **`auth.uid() = user_id`** (or equivalent) for `SELECT` / `INSERT` / `UPDATE` / `DELETE`.
- Avoid `SECURITY DEFINER` functions callable by `anon` unless reviewed; prefer RLS-only access for app data.

---

## Level 2 — Storage (attachments)

The app uses a **private** bucket (see migration `001`: bucket `attachments`, `public = false`).

### 2.1 Bucket settings

- **Storage** → **Buckets** → `attachments` (or your bucket name):
  - **Public bucket**: **off**.
  - Prefer **no public** listing of objects.

### 2.2 Policies (summary)

Policies should allow a signed-in user to read/write/delete only under a path prefix that matches their **`auth.uid()`** (e.g. first folder segment = user id). The migration ships examples using `storage.foldername(name)[1] = auth.uid()::text`.

### 2.3 MIME size and CORS

- Optionally set **file size limit** per bucket to match app expectations.
- **Storage** → **Policies / Configuration**: restrict **CORS allowed origins** to your app origin(s) in production (reduces direct abuse of the Storage API from random sites; CSP already limits your own UI).

### 2.4 Lifecycle (optional)

- Add **object lifecycle** rules if you need automatic cleanup of orphaned uploads (not required for minimal setups).

---

## Level 2 — Network & operations

- Serve the Next app **only over HTTPS** in production (HSTS is enabled in production builds).
- Optionally: Supabase **network restrictions** / IP allowlists if your hosting egress is stable.
- **Logs**: the app emits **`[workflow-security]`** JSON lines for rate limits and failed password logins. Ship stdout to your host’s log drain; set **`WORKFLOW_SECURITY_LOG=0`** to disable.

---

## Migrations reference

| Migration | Topic |
|-----------|--------|
| `001_workflow_cloud_sync.sql` | Tables, RLS policies, Storage bucket + object policies |
| `010_intervention_stops.sql` | `wf_intervention_stops` + RLS |
| `012_security_rls_audit.sql` | Idempotent `ENABLE ROW LEVEL SECURITY` on app tables |

Re-run or verify in SQL Editor after any manual schema change.
