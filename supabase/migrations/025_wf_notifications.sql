-- ──────────────────────────────────────────────────────────────────────────────
-- 025: In-app notification system
-- ──────────────────────────────────────────────────────────────────────────────
-- Notifications are server-only (no Dexie sync) and are inserted by DB triggers.
-- Clients read them via Supabase queries + Realtime.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wf_notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  type       text        NOT NULL CHECK (type IN ('global_procedure_approved')),
  title      text        NOT NULL,
  body       text,
  actor_id   uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  entity_id  uuid,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wf_notifications_user_unread_idx
  ON public.wf_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS wf_notifications_user_created_idx
  ON public.wf_notifications (user_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.wf_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY wf_notifications_select ON public.wf_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Only allow users to update their own notification's read_at (mark-as-read).
CREATE POLICY wf_notifications_update ON public.wf_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Realtime ─────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.wf_notifications;
ALTER TABLE public.wf_notifications REPLICA IDENTITY FULL;

-- ── Trigger: notify all users when a procedure becomes globally approved ──────

CREATE OR REPLACE FUNCTION public.wf_on_global_procedure_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_email text;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved')
  THEN
    SELECT email INTO v_actor_email
    FROM auth.users
    WHERE id = NEW.created_by;

    INSERT INTO public.wf_notifications (user_id, type, title, body, actor_id, entity_id)
    SELECT
      u.id,
      'global_procedure_approved',
      NEW.title,
      v_actor_email,
      NEW.created_by,
      NEW.id
    FROM auth.users u
    WHERE u.id != NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.wf_on_global_procedure_approved() FROM public;

DROP TRIGGER IF EXISTS trg_wf_global_procedure_approved ON public.wf_global_procedures;

CREATE TRIGGER trg_wf_global_procedure_approved
  AFTER INSERT OR UPDATE OF status ON public.wf_global_procedures
  FOR EACH ROW EXECUTE FUNCTION public.wf_on_global_procedure_approved();

NOTIFY pgrst, 'reload schema';
