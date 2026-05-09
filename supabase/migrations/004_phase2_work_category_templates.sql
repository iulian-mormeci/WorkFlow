-- Phase 2 (slice 1): intervention vs activity, flexible job type text, template defaults.

-- wf_interventions: drop fixed job-type enum; add work_category + office flag
alter table public.wf_interventions drop constraint if exists wf_interventions_type_check;

alter table public.wf_interventions
  add column if not exists work_category text;

update public.wf_interventions
set work_category = 'intervention'
where work_category is null;

alter table public.wf_interventions
  alter column work_category set default 'intervention',
  alter column work_category set not null;

do $$
begin
  alter table public.wf_interventions
    add constraint wf_interventions_work_category_check
    check (work_category in ('intervention', 'activity'));
exception
  when duplicate_object then null;
end
$$;

alter table public.wf_interventions
  add column if not exists is_office_activity boolean;

update public.wf_interventions
set is_office_activity = false
where is_office_activity is null;

alter table public.wf_interventions
  alter column is_office_activity set default false,
  alter column is_office_activity set not null;

-- wf_templates: same + optional default client and duration
alter table public.wf_templates drop constraint if exists wf_templates_type_check;

alter table public.wf_templates
  add column if not exists work_category text;

update public.wf_templates
set work_category = 'intervention'
where work_category is null;

alter table public.wf_templates
  alter column work_category set default 'intervention',
  alter column work_category set not null;

do $$
begin
  alter table public.wf_templates
    add constraint wf_templates_work_category_check
    check (work_category in ('intervention', 'activity'));
exception
  when duplicate_object then null;
end
$$;

alter table public.wf_templates
  add column if not exists is_office_activity boolean;

update public.wf_templates
set is_office_activity = false
where is_office_activity is null;

alter table public.wf_templates
  alter column is_office_activity set default false,
  alter column is_office_activity set not null;

alter table public.wf_templates
  add column if not exists default_client_id uuid references public.wf_clients (id) on delete set null;

alter table public.wf_templates
  add column if not exists default_duration_minutes integer;

create index if not exists wf_interventions_user_work_category_idx
  on public.wf_interventions (user_id, work_category);

create index if not exists wf_templates_user_work_category_idx
  on public.wf_templates (user_id, work_category);
