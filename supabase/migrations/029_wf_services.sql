-- ──────────────────────────────────────────────────────────────────────────────
-- 029: Services marketplace (Fase 2) — per-user activatable modules + sidebar
-- ──────────────────────────────────────────────────────────────────────────────
-- wf_services is the platform catalog (managed by the super admin at
-- /admin/services). wf_user_services tracks which optional services each user
-- switched on; "core" services (is_core = true) are always available to
-- everyone and never appear in this table.
--
-- Backfill note: this app started as a single-user tool where Menu→CSV,
-- Scansione Documenti and Chat were always visible. To not regress existing
-- users' sidebar when this migration ships, every current user is backfilled
-- as having activated all non-core services. Only NEW signups after this
-- migration start with just the core services and must opt in via /services.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wf_services (
  id               text        PRIMARY KEY,
  name             text        NOT NULL,
  description      text        NOT NULL,
  long_description text,
  -- Lucide icon name, resolved client-side against a small allow-list map.
  icon             text        NOT NULL,
  -- One of: documents, productivity, horeca, generic (validated app-side).
  category         text        NOT NULL,
  -- Recommended sectors (subset of the wf_profiles.sector vocabulary);
  -- empty array = relevant to every sector ("Generico").
  sector_tags      text[]      NOT NULL DEFAULT '{}',
  -- Route the sidebar links to once the service is visible.
  href             text        NOT NULL,
  is_core          boolean     NOT NULL DEFAULT false,
  -- Platform-wide availability toggle, super-admin only ("disponibile sulla piattaforma").
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wf_user_services (
  user_id      uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  service_id   text        NOT NULL REFERENCES public.wf_services (id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, service_id)
);

CREATE INDEX IF NOT EXISTS wf_user_services_user_idx ON public.wf_user_services (user_id);

-- ── Seed catalog (ricavati dal codice esistente) ──────────────────────────────

INSERT INTO public.wf_services (id, name, description, long_description, icon, category, sector_tags, href, is_core, is_active)
VALUES
  (
    'menu-to-csv',
    'Menu PDF → CSV',
    'Converti il menu PDF del locale in un file CSV pronto per l''import.',
    'Carica il PDF del menu di un ristorante o bar: WorkFlow estrae piatti, categorie e prezzi e genera un CSV pronto per l''import in cassa o gestionale.',
    'receipt',
    'horeca',
    ARRAY['horeca'],
    '/menu-to-csv',
    false,
    true
  ),
  (
    'documents',
    'Scansione Documenti',
    'Scansiona, archivia e ritrova rapidamente i documenti di lavoro.',
    'Usa la fotocamera per scansionare documenti cartacei, ritagliarli e archiviarli in modo ricercabile, collegati ai tuoi interventi o clienti.',
    'file-scan',
    'documents',
    '{}',
    '/documents',
    false,
    true
  ),
  (
    'files',
    'File Sharing',
    'Carica, organizza e condividi file con i colleghi.',
    'Uno spazio Dropbox-like per caricare cartelle e file, condividerli con altri utenti e tenere traccia di chi ha accesso a cosa.',
    'folder-open',
    'productivity',
    '{}',
    '/files',
    true,
    true
  ),
  (
    'agenda',
    'Agenda',
    'Vista unificata di interventi e attività in programma.',
    'Un colpo d''occhio su tutti gli interventi programmati e le attività in scadenza dei prossimi giorni, raggruppati per giorno.',
    'calendar-clock',
    'productivity',
    '{}',
    '/agenda',
    true,
    true
  ),
  (
    'chat',
    'Chat',
    'Messaggistica interna tra colleghi.',
    'Scambia messaggi diretti con i tuoi colleghi o con l''amministratore, con notifiche in tempo reale.',
    'message-circle',
    'productivity',
    '{}',
    '/chat',
    false,
    true
  )
ON CONFLICT (id) DO NOTHING;

-- Preserve today's behaviour for existing users: activate every non-core
-- service for everyone who already has an account.
INSERT INTO public.wf_user_services (user_id, service_id, activated_at)
SELECT u.id, s.id, now()
FROM auth.users u
CROSS JOIN public.wf_services s
WHERE s.is_core = false
ON CONFLICT (user_id, service_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.wf_services      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_user_services ENABLE ROW LEVEL SECURITY;

-- Catalog: visible to everyone when published; the super admin also sees
-- disabled entries (needed for /admin/services). Reuses the admin check
-- already declared for the global-procedures approval workflow (022).
CREATE POLICY wf_services_select ON public.wf_services
  FOR SELECT TO authenticated
  USING (is_active = true OR public.workflow_is_global_procedure_admin());

CREATE POLICY wf_services_insert ON public.wf_services
  FOR INSERT TO authenticated
  WITH CHECK (public.workflow_is_global_procedure_admin());

CREATE POLICY wf_services_update ON public.wf_services
  FOR UPDATE TO authenticated
  USING (public.workflow_is_global_procedure_admin())
  WITH CHECK (public.workflow_is_global_procedure_admin());

CREATE POLICY wf_services_delete ON public.wf_services
  FOR DELETE TO authenticated
  USING (public.workflow_is_global_procedure_admin());

-- Per-user activation: only the owner can see/change their own toggles, and
-- only for services currently published on the platform.
CREATE POLICY wf_user_services_select ON public.wf_user_services
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY wf_user_services_insert ON public.wf_user_services
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND service_id IN (SELECT id FROM public.wf_services WHERE is_active = true)
  );

CREATE POLICY wf_user_services_delete ON public.wf_user_services
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.wf_services;
ALTER TABLE public.wf_services REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.wf_user_services;
ALTER TABLE public.wf_user_services REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
