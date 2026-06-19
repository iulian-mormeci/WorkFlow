-- ──────────────────────────────────────────────────────────────────────────────
-- 027: Dropbox-like file sharing module
-- ──────────────────────────────────────────────────────────────────────────────

-- ── Storage bucket ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shared-files',
  'shared-files',
  false,
  52428800, -- 50 MB limit per file
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp','image/svg+xml','image/tiff',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv','text/markdown',
    'application/zip','application/x-zip-compressed',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: owners upload/manage their own objects; downloads go through signed URL API.
CREATE POLICY "shared_files_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'shared-files' AND split_part(name, '/', 1) = (auth.uid())::text);

CREATE POLICY "shared_files_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'shared-files' AND split_part(name, '/', 1) = (auth.uid())::text);

CREATE POLICY "shared_files_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'shared-files' AND split_part(name, '/', 1) = (auth.uid())::text);

-- ── File metadata table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wf_shared_files (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id    uuid        REFERENCES public.wf_shared_files(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  mime         text,
  size         bigint,
  -- Null for virtual folders; set for uploaded files.
  storage_path text,
  is_folder    boolean     NOT NULL DEFAULT false,
  -- Client-validated + server-side ClamAV integration point.
  scan_status  text        NOT NULL DEFAULT 'pending'
               CHECK (scan_status IN ('pending','clean','infected','skipped')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wf_shared_files_owner_parent_idx
  ON public.wf_shared_files (owner_id, parent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wf_shared_files_parent_idx
  ON public.wf_shared_files (parent_id);

-- ── Sharing table ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wf_file_shares (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id      uuid        NOT NULL REFERENCES public.wf_shared_files(id) ON DELETE CASCADE,
  shared_with  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission   text        NOT NULL DEFAULT 'view'
               CHECK (permission IN ('view','edit')),
  shared_by    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, shared_with)
);

CREATE INDEX IF NOT EXISTS wf_file_shares_shared_with_idx
  ON public.wf_file_shares (shared_with);

-- ── Audit log ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wf_file_audit (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id    uuid        REFERENCES public.wf_shared_files(id) ON DELETE CASCADE,
  actor_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action     text        NOT NULL
             CHECK (action IN ('upload','download','delete','share','unshare','move','rename','create_folder')),
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wf_file_audit_file_idx  ON public.wf_file_audit (file_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wf_file_audit_actor_idx ON public.wf_file_audit (actor_id, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.wf_shared_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_file_shares  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_file_audit   ENABLE ROW LEVEL SECURITY;

-- wf_shared_files
CREATE POLICY wf_shared_files_select ON public.wf_shared_files
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR id IN (SELECT file_id FROM public.wf_file_shares WHERE shared_with = auth.uid())
  );

CREATE POLICY wf_shared_files_insert ON public.wf_shared_files
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY wf_shared_files_update ON public.wf_shared_files
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT file_id FROM public.wf_file_shares
      WHERE shared_with = auth.uid() AND permission = 'edit'
    )
  );

CREATE POLICY wf_shared_files_delete ON public.wf_shared_files
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- wf_file_shares
CREATE POLICY wf_file_shares_select ON public.wf_file_shares
  FOR SELECT TO authenticated
  USING (shared_by = auth.uid() OR shared_with = auth.uid());

CREATE POLICY wf_file_shares_insert ON public.wf_file_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    shared_by = auth.uid()
    AND file_id IN (SELECT id FROM public.wf_shared_files WHERE owner_id = auth.uid())
  );

CREATE POLICY wf_file_shares_delete ON public.wf_file_shares
  FOR DELETE TO authenticated
  USING (shared_by = auth.uid());

-- wf_file_audit
CREATE POLICY wf_file_audit_select ON public.wf_file_audit
  FOR SELECT TO authenticated
  USING (
    actor_id = auth.uid()
    OR file_id IN (SELECT id FROM public.wf_shared_files WHERE owner_id = auth.uid())
  );

CREATE POLICY wf_file_audit_insert ON public.wf_file_audit
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- ── Share-by-email function ───────────────────────────────────────────────────
-- Looks up auth.users (not public) and creates the share in one transaction.

CREATE OR REPLACE FUNCTION public.wf_share_file_with_email(
  p_file_id   uuid,
  p_email     text,
  p_permission text DEFAULT 'view'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id uuid;
  v_owner_id  uuid;
BEGIN
  -- Verify caller owns the file
  SELECT owner_id INTO v_owner_id FROM wf_shared_files WHERE id = p_file_id;
  IF v_owner_id IS NULL OR v_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  -- Resolve email → user id
  SELECT id INTO v_target_id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;
  IF v_target_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_share_with_self';
  END IF;

  -- Upsert share
  INSERT INTO wf_file_shares (file_id, shared_with, permission, shared_by)
  VALUES (p_file_id, v_target_id, p_permission, auth.uid())
  ON CONFLICT (file_id, shared_with) DO UPDATE SET permission = EXCLUDED.permission;

  -- Audit
  INSERT INTO wf_file_audit (file_id, actor_id, action, detail)
  VALUES (p_file_id, auth.uid(), 'share',
    jsonb_build_object('email', p_email, 'permission', p_permission));

  RETURN jsonb_build_object('ok', true, 'shared_with', v_target_id);
END;
$$;

REVOKE ALL ON FUNCTION public.wf_share_file_with_email(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.wf_share_file_with_email(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
