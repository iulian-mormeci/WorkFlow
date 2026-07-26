-- ──────────────────────────────────────────────────────────────────────────────
-- 031: Fix infinite recursion in wf_company_members RLS policies
-- ──────────────────────────────────────────────────────────────────────────────
-- 028 gave wf_company_members SELECT/UPDATE/DELETE policies that queried
-- wf_company_members *from within its own policy* to check "which company am
-- I in" / "am I admin of this company". Postgres re-evaluates that same
-- policy for the subquery, forever: "infinite recursion detected in policy
-- for relation wf_company_members".
--
-- Fix: move those lookups into SECURITY DEFINER functions. Such a function
-- runs as its owner (bypassing RLS for that one internal read), so the
-- recursion never starts — the same pattern already used for
-- workflow_is_global_procedure_admin() (022).
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wf_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.wf_company_members WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.wf_my_company_id() FROM public;
GRANT EXECUTE ON FUNCTION public.wf_my_company_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.wf_is_company_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wf_company_members
    WHERE user_id = auth.uid() AND company_id = p_company_id AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.wf_is_company_admin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.wf_is_company_admin(uuid) TO authenticated;

-- ── Replace the three self-referencing policies ───────────────────────────────
-- (wf_profiles / wf_companies / wf_procedures policies that merely *read*
-- wf_company_members from another table's policy are not recursive by
-- themselves and need no change — they'll start working again once the
-- policies below stop looping.)

DROP POLICY IF EXISTS wf_company_members_select ON public.wf_company_members;
CREATE POLICY wf_company_members_select ON public.wf_company_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR company_id = public.wf_my_company_id()
  );

DROP POLICY IF EXISTS wf_company_members_update ON public.wf_company_members;
CREATE POLICY wf_company_members_update ON public.wf_company_members
  FOR UPDATE TO authenticated
  USING (public.wf_is_company_admin(company_id))
  WITH CHECK (public.wf_is_company_admin(company_id));

DROP POLICY IF EXISTS wf_company_members_delete ON public.wf_company_members;
CREATE POLICY wf_company_members_delete ON public.wf_company_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.wf_is_company_admin(company_id)
  );

NOTIFY pgrst, 'reload schema';
