-- Security audit: ensure RLS stays enabled on all WorkFlow application tables.
-- Policies are defined in earlier migrations (001, 010); this migration is safe to re-apply.
--
-- Operational recommendations (Supabase Dashboard / Auth):
-- 1) Authentication → enable "Refresh token reuse detection" / rotation (hosted: Auth settings).
-- 2) Use anon key in browsers only; never expose SUPABASE_SERVICE_ROLE_KEY to clients.
-- 3) Review API rate limits at the edge (app middleware) for login and email routes.
-- 4) Storage bucket "attachments" remains private; policies in 001 restrict by auth.uid() folder.

alter table if exists public.wf_clients enable row level security;
alter table if exists public.wf_spare_parts enable row level security;
alter table if exists public.wf_attachments enable row level security;
alter table if exists public.wf_interventions enable row level security;
alter table if exists public.wf_stock_movements enable row level security;
alter table if exists public.wf_tickets enable row level security;
alter table if exists public.wf_documents enable row level security;
alter table if exists public.wf_support_email_outbox enable row level security;
alter table if exists public.wf_templates enable row level security;
alter table if exists public.wf_intervention_stops enable row level security;

notify pgrst, 'reload schema';
