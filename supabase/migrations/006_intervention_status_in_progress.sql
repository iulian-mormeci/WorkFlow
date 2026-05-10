-- Allow explicit in_progress on interventions (manual workflow status).

alter table public.wf_interventions drop constraint if exists wf_interventions_status_check;

alter table public.wf_interventions
  add constraint wf_interventions_status_check
  check (status is null or status in ('open', 'in_progress', 'completed'));
