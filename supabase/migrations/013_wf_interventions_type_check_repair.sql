-- Repair: allow free-text job type on interventions and templates.
-- Fixes upsert failures when remote DB still has the legacy enum check
-- (maintenance, repair, install, other) from 001_workflow_cloud_sync.sql.

alter table public.wf_interventions drop constraint if exists wf_interventions_type_check;
alter table public.wf_templates drop constraint if exists wf_templates_type_check;

-- Optional: keep type non-empty without restricting values.
do $$
begin
  alter table public.wf_interventions
    add constraint wf_interventions_type_nonempty_check
    check (char_length(trim(type)) > 0);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.wf_templates
    add constraint wf_templates_type_nonempty_check
    check (char_length(trim(type)) > 0);
exception
  when duplicate_object then null;
end
$$;

notify pgrst, 'reload schema';
