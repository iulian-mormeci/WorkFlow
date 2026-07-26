-- ──────────────────────────────────────────────────────────────────────────────
-- 030: Procedures sector filter (Fase 3) + company-shared personal procedures
-- ──────────────────────────────────────────────────────────────────────────────
-- Purely additive. Reuses the sector_tags[] pattern already shipped on
-- wf_services (029): empty array = relevant to every sector.
--
-- wf_procedures keeps its existing personal, per-user RLS untouched for
-- INSERT/UPDATE/DELETE (only the owner can ever edit/delete their own row).
-- SELECT is extended so a row tagged with company_id is also readable by
-- teammates in that company — the client mirrors those into a dedicated
-- read-only Dexie table (companyProcedures), the same "browse then clone"
-- pattern already used for wf_global_procedures.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.wf_procedures
  ADD COLUMN IF NOT EXISTS sector_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.wf_companies (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS wf_procedures_company_idx
  ON public.wf_procedures (company_id)
  WHERE company_id IS NOT NULL;

ALTER TABLE public.wf_global_procedures
  ADD COLUMN IF NOT EXISTS sector_tags text[] NOT NULL DEFAULT '{}';

-- ── RLS: extend wf_procedures SELECT to company-shared rows ──────────────────

DROP POLICY IF EXISTS wf_procedures_select ON public.wf_procedures;
CREATE POLICY wf_procedures_select ON public.wf_procedures
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      company_id IS NOT NULL
      AND company_id IN (SELECT company_id FROM public.wf_company_members WHERE user_id = auth.uid())
    )
  );

-- INSERT/UPDATE still owner-only, but validate company_id (if set) is a
-- company the caller actually belongs to — can't tag someone else's company.
DROP POLICY IF EXISTS wf_procedures_insert ON public.wf_procedures;
CREATE POLICY wf_procedures_insert ON public.wf_procedures
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      company_id IS NULL
      OR company_id IN (SELECT company_id FROM public.wf_company_members WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS wf_procedures_update ON public.wf_procedures;
CREATE POLICY wf_procedures_update ON public.wf_procedures
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      company_id IS NULL
      OR company_id IN (SELECT company_id FROM public.wf_company_members WHERE user_id = auth.uid())
    )
  );

-- DELETE policy is unchanged (auth.uid() = user_id) — re-declared here only
-- for completeness/idempotency alongside the others.
DROP POLICY IF EXISTS wf_procedures_delete ON public.wf_procedures;
CREATE POLICY wf_procedures_delete ON public.wf_procedures
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
