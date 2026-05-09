-- Phase 2 Part 2: due date, timer run state, reminders, route locations.

alter table public.wf_interventions
  add column if not exists due_at timestamptz;

alter table public.wf_interventions
  add column if not exists timer_run_state text not null default 'idle';

update public.wf_interventions
set timer_run_state = 'running'
where timer_started_at is not null and timer_run_state = 'idle';

alter table public.wf_interventions
  add column if not exists timer_accumulated_seconds integer not null default 0;

alter table public.wf_interventions
  add column if not exists reminders_enabled boolean not null default false;

alter table public.wf_interventions
  add column if not exists reminder_preset text;

alter table public.wf_interventions
  add column if not exists reminder_custom_at timestamptz;

alter table public.wf_interventions
  add column if not exists reminder_email_to text;

alter table public.wf_interventions
  add column if not exists reminder_last_fire_at timestamptz;

alter table public.wf_interventions
  add column if not exists start_location jsonb;

alter table public.wf_interventions
  add column if not exists end_location jsonb;

alter table public.wf_interventions
  add column if not exists location_km_auto double precision;

create index if not exists wf_interventions_user_due_at_idx
  on public.wf_interventions (user_id, due_at);
