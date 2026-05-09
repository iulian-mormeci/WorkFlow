-- Enable Supabase Realtime for WorkFlow tables (Section Sync 2).
-- Requires: Supabase project with Realtime enabled (default on hosted).

alter publication supabase_realtime add table public.wf_clients;
alter publication supabase_realtime add table public.wf_spare_parts;
alter publication supabase_realtime add table public.wf_attachments;
alter publication supabase_realtime add table public.wf_interventions;
alter publication supabase_realtime add table public.wf_stock_movements;
alter publication supabase_realtime add table public.wf_tickets;
alter publication supabase_realtime add table public.wf_documents;
alter publication supabase_realtime add table public.wf_support_email_outbox;
alter publication supabase_realtime add table public.wf_templates;
