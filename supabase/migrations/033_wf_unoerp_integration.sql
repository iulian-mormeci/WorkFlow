-- ──────────────────────────────────────────────────────────────────────────────
-- 033: UnoERP integration — per-user credentials + synced "mie__programmate"
-- activities surfaced read-only in the existing agenda/calendar.
-- ──────────────────────────────────────────────────────────────────────────────
-- wf_unoerp_credentials is server-only: the encrypted token never reaches the
-- client, so it is queried exclusively from Next.js Route Handlers (the user's
-- own session for connect/disconnect/sync, the service-role client for the
-- hourly cron across all users).
--
-- wf_unoerp_events is a plain read-only mirror of UnoERP's `mie__programmate`
-- section, one row per ERP activity (`unoerp_id` = their `id_prot`, unique per
-- user so re-syncing upserts instead of duplicating). The browser reads this
-- table directly via the Supabase client (RLS-protected) — there is no local
-- offline cache for this feature, per the platform's move to online-only.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wf_unoerp_credentials (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  base_url          text        NOT NULL,
  token_encrypted   text        NOT NULL,
  token_iv          text        NOT NULL,
  last_auth_at      timestamptz,
  last_sync_at      timestamptz,
  last_sync_status  text        CHECK (last_sync_status IN ('success', 'error', 'running')),
  last_sync_count   integer     NOT NULL DEFAULT 0,
  last_sync_error   text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wf_unoerp_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY wf_unoerp_credentials_select ON public.wf_unoerp_credentials
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY wf_unoerp_credentials_insert ON public.wf_unoerp_credentials
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY wf_unoerp_credentials_update ON public.wf_unoerp_credentials
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY wf_unoerp_credentials_delete ON public.wf_unoerp_credentials
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.wf_unoerp_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  unoerp_id    text        NOT NULL,
  title        text        NOT NULL,
  start_at     timestamptz NOT NULL,
  end_at       timestamptz NOT NULL,
  all_day      boolean     NOT NULL DEFAULT false,
  description  text,
  subtitle     text,
  color        text,
  category     text,
  priority     text,
  ticket_type  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wf_unoerp_events_user_unoerp_id_key UNIQUE (user_id, unoerp_id)
);

CREATE INDEX IF NOT EXISTS wf_unoerp_events_user_start_idx
  ON public.wf_unoerp_events (user_id, start_at);

ALTER TABLE public.wf_unoerp_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY wf_unoerp_events_select ON public.wf_unoerp_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY wf_unoerp_events_insert ON public.wf_unoerp_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY wf_unoerp_events_update ON public.wf_unoerp_events
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY wf_unoerp_events_delete ON public.wf_unoerp_events
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
