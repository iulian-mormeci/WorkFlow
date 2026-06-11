-- Approval workflow for community-submitted global procedures.
-- Any authenticated user can submit a procedure for review (status='pending').
-- Admins/owners can approve or reject. Trusted contributors bypass approval.
--
-- Self-contained: re-declares workflow_is_global_procedure_admin() so this
-- migration runs correctly regardless of whether 018 applied it already.

-- ─── re-declare base admin check (idempotent) ──────────────────────────────
-- Reads role from auth.users (DB) rather than JWT claims so it is always
-- up-to-date even if the client token was issued before the role was set.

CREATE OR REPLACE FUNCTION public.workflow_is_global_procedure_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND (raw_user_meta_data ->> 'role') IN ('admin', 'owner')
  );
$$;

REVOKE ALL ON FUNCTION public.workflow_is_global_procedure_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.workflow_is_global_procedure_admin() TO authenticated;

-- ─── schema changes ────────────────────────────────────────────────────────

ALTER TABLE public.wf_global_procedures
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users (id);

CREATE INDEX IF NOT EXISTS wf_global_procedures_status_idx
  ON public.wf_global_procedures (status);

-- ─── trusted contributor helper ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.workflow_is_trusted_contributor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND (raw_user_meta_data ->> 'role') IN ('admin', 'owner', 'trusted_contributor')
  );
$$;

REVOKE ALL ON FUNCTION public.workflow_is_trusted_contributor() FROM public;
GRANT EXECUTE ON FUNCTION public.workflow_is_trusted_contributor() TO authenticated;

-- ─── RLS – replace old policies ────────────────────────────────────────────

DROP POLICY IF EXISTS wf_global_procedures_select ON public.wf_global_procedures;
DROP POLICY IF EXISTS wf_global_procedures_insert ON public.wf_global_procedures;
DROP POLICY IF EXISTS wf_global_procedures_update ON public.wf_global_procedures;
DROP POLICY IF EXISTS wf_global_procedures_delete ON public.wf_global_procedures;

-- SELECT: admins see all statuses; users see approved + their own submissions
CREATE POLICY wf_global_procedures_select ON public.wf_global_procedures
  FOR SELECT TO authenticated
  USING (
    status = 'approved'
    OR public.workflow_is_global_procedure_admin()
    OR created_by = auth.uid()
  );

-- INSERT: admin/trusted → any status; others → pending only
CREATE POLICY wf_global_procedures_insert ON public.wf_global_procedures
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      status = 'pending'
      OR public.workflow_is_trusted_contributor()
    )
  );

-- UPDATE: only admins (approve / reject / edit)
CREATE POLICY wf_global_procedures_update ON public.wf_global_procedures
  FOR UPDATE TO authenticated
  USING (public.workflow_is_global_procedure_admin())
  WITH CHECK (public.workflow_is_global_procedure_admin());

-- DELETE: admins can delete any; users can retract their own pending/rejected
CREATE POLICY wf_global_procedures_delete ON public.wf_global_procedures
  FOR DELETE TO authenticated
  USING (
    public.workflow_is_global_procedure_admin()
    OR (created_by = auth.uid() AND status IN ('pending', 'rejected'))
  );

-- ─── admin helpers (SECURITY DEFINER) ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.workflow_admin_list_users()
RETURNS TABLE (
  id              uuid,
  email           text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  role            text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.workflow_is_global_procedure_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
    SELECT
      u.id,
      u.email::text,
      u.created_at,
      u.last_sign_in_at,
      (u.raw_user_meta_data ->> 'role')::text AS role
    FROM auth.users u
    ORDER BY u.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.workflow_admin_list_users() FROM public;
GRANT EXECUTE ON FUNCTION public.workflow_admin_list_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.workflow_admin_set_user_role(
  p_target_user_id uuid,
  p_new_role        text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.workflow_is_global_procedure_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE auth.users
  SET raw_user_meta_data =
    COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_new_role)
  WHERE id = p_target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.workflow_admin_set_user_role(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.workflow_admin_set_user_role(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.workflow_admin_stats()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_users    bigint;
  v_approved bigint;
  v_pending  bigint;
  v_rejected bigint;
BEGIN
  IF NOT public.workflow_is_global_procedure_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT count(*) INTO v_users FROM auth.users;

  SELECT
    count(*) FILTER (WHERE status = 'approved'),
    count(*) FILTER (WHERE status = 'pending'),
    count(*) FILTER (WHERE status = 'rejected')
  INTO v_approved, v_pending, v_rejected
  FROM public.wf_global_procedures;

  RETURN json_build_object(
    'totalUsers',    v_users,
    'approvedProcs', v_approved,
    'pendingProcs',  v_pending,
    'rejectedProcs', v_rejected
  );
END;
$$;

REVOKE ALL ON FUNCTION public.workflow_admin_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.workflow_admin_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';
