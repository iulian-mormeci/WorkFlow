-- Repair: ensure wf_interventions status constraint allows in_progress.
-- Fixes upsert failures when remote DB still has the old ('open','completed') check.

alter table public.wf_interventions drop constraint if exists wf_interventions_status_check;

-- Coerce any unexpected values to open (defensive).
update public.wf_interventions
set status = 'open'
where status is not null and status not in ('open', 'in_progress', 'completed');

alter table public.wf_interventions
  add constraint wf_interventions_status_check
  check (status is null or status in ('open', 'in_progress', 'completed'));

notify pgrst, 'reload schema';

