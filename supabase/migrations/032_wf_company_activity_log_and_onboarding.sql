-- ──────────────────────────────────────────────────────────────────────────────
-- 032: Company activity log (Fase 4 dashboard widget) + onboarding flag
-- ──────────────────────────────────────────────────────────────────────────────
-- Purely additive. wf_company_activity_log is a real, trigger-populated feed
-- (not inferred client-side): a teammate joins/leaves, or shares a procedure
-- with the company, and everyone in that company sees it in their dashboard
-- "Attività aziendali recenti" widget. Rows are never written directly by
-- clients — only by SECURITY DEFINER trigger functions — so there is no
-- INSERT/UPDATE/DELETE policy for `authenticated` on purpose.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wf_company_activity_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES public.wf_companies (id) ON DELETE CASCADE,
  actor_id     uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  type         text        NOT NULL CHECK (type IN ('member_joined', 'member_left', 'procedure_shared')),
  -- Optional reference to the row the event is about (a user id or a procedure id).
  entity_id    uuid,
  -- Denormalized snapshot (e.g. procedure title at share time) so the feed
  -- still reads fine even if the entity is later renamed/deleted.
  entity_label text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wf_company_activity_log_company_idx
  ON public.wf_company_activity_log (company_id, created_at DESC);

ALTER TABLE public.wf_company_activity_log ENABLE ROW LEVEL SECURITY;

-- Reuses wf_my_company_id() (031) — SECURITY DEFINER, so no recursion risk.
CREATE POLICY wf_company_activity_log_select ON public.wf_company_activity_log
  FOR SELECT TO authenticated
  USING (company_id = public.wf_my_company_id());

-- ── Triggers ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wf_log_member_joined()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wf_company_activity_log (company_id, actor_id, type, entity_id)
  VALUES (NEW.company_id, NEW.user_id, 'member_joined', NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wf_member_joined ON public.wf_company_members;
CREATE TRIGGER trg_wf_member_joined
  AFTER INSERT ON public.wf_company_members
  FOR EACH ROW EXECUTE FUNCTION public.wf_log_member_joined();

CREATE OR REPLACE FUNCTION public.wf_log_member_left()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wf_company_activity_log (company_id, actor_id, type, entity_id)
  VALUES (OLD.company_id, OLD.user_id, 'member_left', OLD.user_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_wf_member_left ON public.wf_company_members;
CREATE TRIGGER trg_wf_member_left
  AFTER DELETE ON public.wf_company_members
  FOR EACH ROW EXECUTE FUNCTION public.wf_log_member_left();

CREATE OR REPLACE FUNCTION public.wf_log_procedure_shared()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.company_id IS NOT NULL THEN
      INSERT INTO public.wf_company_activity_log (company_id, actor_id, type, entity_id, entity_label)
      VALUES (NEW.company_id, NEW.user_id, 'procedure_shared', NEW.id, NEW.title);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.company_id IS NOT NULL AND OLD.company_id IS DISTINCT FROM NEW.company_id THEN
      INSERT INTO public.wf_company_activity_log (company_id, actor_id, type, entity_id, entity_label)
      VALUES (NEW.company_id, NEW.user_id, 'procedure_shared', NEW.id, NEW.title);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wf_procedure_shared ON public.wf_procedures;
CREATE TRIGGER trg_wf_procedure_shared
  AFTER INSERT OR UPDATE OF company_id ON public.wf_procedures
  FOR EACH ROW EXECUTE FUNCTION public.wf_log_procedure_shared();

ALTER PUBLICATION supabase_realtime ADD TABLE public.wf_company_activity_log;
ALTER TABLE public.wf_company_activity_log REPLICA IDENTITY FULL;

-- ── Onboarding flag ──────────────────────────────────────────────────────────
-- NULL = wizard not completed yet. Existing users are backfilled to "already
-- onboarded" so nobody who's been using the app gets the first-run wizard.

ALTER TABLE public.wf_profiles
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

UPDATE public.wf_profiles SET onboarded_at = created_at WHERE onboarded_at IS NULL;

NOTIFY pgrst, 'reload schema';
