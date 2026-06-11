-- Internal messaging between users.
-- Chat is cloud-only (no Dexie offline) — real-time delivery is the primary mode.
-- receiver_id = null means the message is addressed to the admin channel.
-- Admin can read every message; users see only messages they sent or received.
--
-- Self-contained: re-declares workflow_is_global_procedure_admin() so this
-- migration runs correctly regardless of prior migration state.

-- ─── re-declare base admin check (idempotent) ──────────────────────────────

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

-- ─── table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wf_messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  receiver_id  uuid        REFERENCES auth.users (id) ON DELETE CASCADE,
  content      text        NOT NULL CHECK (char_length(content) > 0),
  procedure_id uuid        REFERENCES public.wf_global_procedures (id) ON DELETE SET NULL,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wf_messages_sender_idx
  ON public.wf_messages (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wf_messages_receiver_idx
  ON public.wf_messages (receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wf_messages_thread_idx
  ON public.wf_messages (
    LEAST(sender_id, receiver_id),
    GREATEST(sender_id, receiver_id),
    created_at DESC
  );

ALTER TABLE public.wf_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_messages REPLICA IDENTITY FULL;

-- ─── RLS ───────────────────────────────────────────────────────────────────

-- SELECT: sender and receiver can read; admin reads all
CREATE POLICY wf_messages_select ON public.wf_messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR public.workflow_is_global_procedure_admin()
  );

-- INSERT: authenticated user sends as themselves
CREATE POLICY wf_messages_insert ON public.wf_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- UPDATE: sender edits own; receiver marks as read; admin can do either
CREATE POLICY wf_messages_update ON public.wf_messages
  FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR public.workflow_is_global_procedure_admin()
  );

-- DELETE: sender deletes own; admin deletes any
CREATE POLICY wf_messages_delete ON public.wf_messages
  FOR DELETE TO authenticated
  USING (
    sender_id = auth.uid()
    OR public.workflow_is_global_procedure_admin()
  );

-- ─── realtime ──────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.wf_messages;

NOTIFY pgrst, 'reload schema';
