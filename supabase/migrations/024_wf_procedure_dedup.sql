-- ──────────────────────────────────────────────────────────────────────────────
-- 024: Procedure de-duplication + unique constraints
-- ──────────────────────────────────────────────────────────────────────────────
-- STEP 0 – diagnostic report (counts only; no data deleted yet).
-- Run the SELECT block below standalone to audit before applying.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_dup_personal  bigint;
  v_dup_global    bigint;
BEGIN
  -- Duplicate personal procedures (same user + title after trim/lower)
  SELECT count(*) INTO v_dup_personal
  FROM (
    SELECT user_id, lower(trim(title)), count(*) AS n
    FROM public.wf_procedures
    GROUP BY user_id, lower(trim(title))
    HAVING count(*) > 1
  ) t;

  -- Duplicate pending global submissions (same author + title)
  SELECT count(*) INTO v_dup_global
  FROM (
    SELECT created_by, lower(trim(title)), count(*) AS n
    FROM public.wf_global_procedures
    WHERE status = 'pending'
    GROUP BY created_by, lower(trim(title))
    HAVING count(*) > 1
  ) t;

  RAISE NOTICE '[024] wf_procedures duplicates: % groups found', v_dup_personal;
  RAISE NOTICE '[024] wf_global_procedures pending duplicates: % groups found', v_dup_global;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- STEP 1 – remove duplicate personal procedures (keep oldest created_at).
-- ──────────────────────────────────────────────────────────────────────────────
DELETE FROM public.wf_procedures
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY user_id, lower(trim(title))
             ORDER BY created_at ASC
           ) AS rn
    FROM public.wf_procedures
  ) ranked
  WHERE rn > 1
);

-- ──────────────────────────────────────────────────────────────────────────────
-- STEP 2 – remove duplicate pending global submissions (keep oldest).
-- ──────────────────────────────────────────────────────────────────────────────
DELETE FROM public.wf_global_procedures
WHERE status = 'pending'
  AND id IN (
    SELECT id FROM (
      SELECT id,
             row_number() OVER (
               PARTITION BY created_by, lower(trim(title))
               ORDER BY created_at ASC
             ) AS rn
      FROM public.wf_global_procedures
      WHERE status = 'pending'
    ) ranked
    WHERE rn > 1
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- STEP 3 – add source tracking columns.
-- ──────────────────────────────────────────────────────────────────────────────

-- Track which global preset a personal procedure was cloned from.
ALTER TABLE public.wf_procedures
  ADD COLUMN IF NOT EXISTS source_global_id uuid
    REFERENCES public.wf_global_procedures (id) ON DELETE SET NULL;

-- Track which personal procedure was the origin of a global submission.
-- No FK: personal procedures can be deleted independently.
ALTER TABLE public.wf_global_procedures
  ADD COLUMN IF NOT EXISTS source_procedure_id uuid;

-- ──────────────────────────────────────────────────────────────────────────────
-- STEP 4 – unique constraints to block future duplicates.
-- ──────────────────────────────────────────────────────────────────────────────

-- A user can only clone a given global preset once.
CREATE UNIQUE INDEX IF NOT EXISTS wf_procedures_user_source_global_idx
  ON public.wf_procedures (user_id, source_global_id)
  WHERE source_global_id IS NOT NULL;

-- A user can only have one active (pending or approved) submission per source procedure.
CREATE UNIQUE INDEX IF NOT EXISTS wf_global_procs_creator_source_active_idx
  ON public.wf_global_procedures (created_by, source_procedure_id)
  WHERE source_procedure_id IS NOT NULL
    AND status IN ('pending', 'approved');

-- ──────────────────────────────────────────────────────────────────────────────
-- STEP 5 – indexes for the new columns.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS wf_procedures_source_global_idx
  ON public.wf_procedures (source_global_id)
  WHERE source_global_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wf_global_procs_source_procedure_idx
  ON public.wf_global_procedures (source_procedure_id)
  WHERE source_procedure_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
