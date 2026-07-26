-- ──────────────────────────────────────────────────────────────────────────────
-- 028: Personal profiles + multi-tenant companies
-- ──────────────────────────────────────────────────────────────────────────────
-- Purely additive: no existing table is touched. Personal preferences that
-- already lived in auth.users.user_metadata (techName, office_address, ...)
-- stay there; this migration only adds the new "who is this user" (wf_profiles)
-- and "which company are they in" (wf_companies / wf_company_members) concepts
-- that Fase 1 needs, plus the sector field that Fase 3's procedure filter reads.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── wf_profiles: personal profile (1:1 with auth.users) ───────────────────────

CREATE TABLE IF NOT EXISTS public.wf_profiles (
  id            uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  first_name    text,
  last_name     text,
  avatar_url    text,
  -- Free-form profession label (e.g. "Idraulico") shown alongside role_category.
  role_title    text,
  -- Loose category, validated app-side against a shared constant list so it
  -- can grow without a migration (Tecnico, Ristoratore, Commerciante, ...).
  role_category text,
  -- Drives the procedures sector filter in Fase 3 (HoReCa, Informatica, ...).
  sector        text,
  bio           text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Backfill: every existing user gets an empty profile row so the account page
-- has something to read/update immediately, with zero data loss.
INSERT INTO public.wf_profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Auto-create a profile row for every future signup.
CREATE OR REPLACE FUNCTION public.wf_handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wf_profiles (id) VALUES (new.id) ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS wf_on_auth_user_created ON auth.users;

CREATE TRIGGER wf_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.wf_handle_new_user();

-- ── wf_companies ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wf_companies (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  piva        text,
  sector      text,
  logo_url    text,
  address     text,
  website     text,
  email       text,
  phone       text,
  -- Random 8-char code shown to the admin to invite teammates.
  invite_code text        NOT NULL UNIQUE,
  created_by  uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── wf_company_members ─────────────────────────────────────────────────────
-- UNIQUE(user_id) enforces "a user belongs to at most one company at a time".

CREATE TABLE IF NOT EXISTS public.wf_company_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.wf_companies (id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  role        text        NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'manager', 'member')),
  joined_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wf_company_members_company_idx
  ON public.wf_company_members (company_id);

-- ── Storage buckets (public read; write restricted to the owning folder) ──────
-- Declared after wf_company_members so the company-logos admin-check subquery
-- below can reference an already-existing table.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY avatars_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND split_part(name, '/', 1) = (auth.uid())::text);

CREATE POLICY avatars_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND split_part(name, '/', 1) = (auth.uid())::text);

CREATE POLICY avatars_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND split_part(name, '/', 1) = (auth.uid())::text);

CREATE POLICY company_logos_admin_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND split_part(name, '/', 1) IN (
      SELECT company_id::text FROM public.wf_company_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY company_logos_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND split_part(name, '/', 1) IN (
      SELECT company_id::text FROM public.wf_company_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY company_logos_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND split_part(name, '/', 1) IN (
      SELECT company_id::text FROM public.wf_company_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.wf_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_company_members ENABLE ROW LEVEL SECURITY;

-- wf_profiles: everyone can read/update their own row; teammates in the same
-- company can read each other's name/photo/role for the company member list.
CREATE POLICY wf_profiles_select ON public.wf_profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR id IN (
      SELECT cm2.user_id
      FROM public.wf_company_members cm1
      JOIN public.wf_company_members cm2 ON cm2.company_id = cm1.company_id
      WHERE cm1.user_id = auth.uid()
    )
  );

CREATE POLICY wf_profiles_insert ON public.wf_profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY wf_profiles_update ON public.wf_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY wf_profiles_delete ON public.wf_profiles
  FOR DELETE TO authenticated
  USING (id = auth.uid());

-- wf_companies: readable by members only. Row creation always goes through
-- wf_create_company() (SECURITY DEFINER) below, so there is no direct INSERT
-- policy for regular clients. Only admins can edit company data.
CREATE POLICY wf_companies_select ON public.wf_companies
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT company_id FROM public.wf_company_members WHERE user_id = auth.uid())
  );

CREATE POLICY wf_companies_update ON public.wf_companies
  FOR UPDATE TO authenticated
  USING (
    id IN (SELECT company_id FROM public.wf_company_members WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    id IN (SELECT company_id FROM public.wf_company_members WHERE user_id = auth.uid() AND role = 'admin')
  );

-- wf_company_members: members can see their own company roster. Joining a
-- company always goes through wf_create_company() / wf_join_company_by_invite_code()
-- below, so there is no direct INSERT policy. Admins manage roles/removals.
CREATE POLICY wf_company_members_select ON public.wf_company_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR company_id IN (SELECT company_id FROM public.wf_company_members WHERE user_id = auth.uid())
  );

CREATE POLICY wf_company_members_update ON public.wf_company_members
  FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM public.wf_company_members cm
      WHERE cm.user_id = auth.uid() AND cm.role = 'admin'
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM public.wf_company_members cm
      WHERE cm.user_id = auth.uid() AND cm.role = 'admin'
    )
  );

-- Leave company (self) or admin removes a teammate.
CREATE POLICY wf_company_members_delete ON public.wf_company_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR company_id IN (
      SELECT cm.company_id FROM public.wf_company_members cm
      WHERE cm.user_id = auth.uid() AND cm.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs: create / join a company atomically, bypassing the (intentionally
-- policy-less) direct INSERT path.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wf_generate_invite_code()
RETURNS text
LANGUAGE sql
AS $$
  SELECT upper(substr(md5(gen_random_uuid()::text), 1, 8));
$$;

CREATE OR REPLACE FUNCTION public.wf_create_company(
  p_name    text,
  p_piva    text DEFAULT NULL,
  p_sector  text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_website text DEFAULT NULL,
  p_email   text DEFAULT NULL,
  p_phone   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id  uuid;
  v_invite_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM wf_company_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'already_in_company';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  LOOP
    v_invite_code := wf_generate_invite_code();
    BEGIN
      INSERT INTO wf_companies (name, piva, sector, address, website, email, phone, invite_code, created_by)
      VALUES (btrim(p_name), p_piva, p_sector, p_address, p_website, p_email, p_phone, v_invite_code, auth.uid())
      RETURNING id INTO v_company_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- invite_code collision (extremely unlikely): loop and try a fresh code.
    END;
  END LOOP;

  INSERT INTO wf_company_members (company_id, user_id, role)
  VALUES (v_company_id, auth.uid(), 'admin');

  RETURN jsonb_build_object('ok', true, 'company_id', v_company_id, 'invite_code', v_invite_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.wf_join_company_by_invite_code(p_invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM wf_company_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'already_in_company';
  END IF;

  SELECT id INTO v_company_id
  FROM wf_companies
  WHERE invite_code = upper(btrim(p_invite_code));

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'invalid_invite_code';
  END IF;

  INSERT INTO wf_company_members (company_id, user_id, role)
  VALUES (v_company_id, auth.uid(), 'member');

  RETURN jsonb_build_object('ok', true, 'company_id', v_company_id);
END;
$$;

REVOKE ALL ON FUNCTION public.wf_create_company(text, text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.wf_create_company(text, text, text, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.wf_join_company_by_invite_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.wf_join_company_by_invite_code(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.wf_profiles;
ALTER TABLE public.wf_profiles REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.wf_companies;
ALTER TABLE public.wf_companies REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.wf_company_members;
ALTER TABLE public.wf_company_members REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
