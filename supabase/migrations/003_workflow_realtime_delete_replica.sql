-- Realtime postgres_changes filters use `user_id=eq.<uuid>`.
-- For DELETE, Postgres default REPLICA IDENTITY only puts the primary key in `old`,
-- so `user_id` is missing and Realtime drops the event before it reaches the client.
-- FULL replica identity includes `user_id` in DELETE payloads so filters match.

alter table public.wf_clients replica identity full;
alter table public.wf_spare_parts replica identity full;
alter table public.wf_attachments replica identity full;
alter table public.wf_interventions replica identity full;
alter table public.wf_stock_movements replica identity full;
alter table public.wf_tickets replica identity full;
alter table public.wf_documents replica identity full;
alter table public.wf_support_email_outbox replica identity full;
alter table public.wf_templates replica identity full;
