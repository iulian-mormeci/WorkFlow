-- CRM tickets: add the pre-due + due reminder model so tickets match interventions
-- and activities (browser notifications, tier acks). `reminder_at` / `due_at` stay as-is.

alter table public.wf_tickets
  add column if not exists reminders_enabled boolean not null default false,
  add column if not exists reminder_preset text,
  add column if not exists reminder_custom_at timestamptz,
  add column if not exists reminder_pre_due_ack_at timestamptz,
  add column if not exists reminder_due_ack_at timestamptz;

-- Validate the preset enum (nullable; only constrain known values).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wf_tickets_reminder_preset_check'
  ) then
    alter table public.wf_tickets
      add constraint wf_tickets_reminder_preset_check
      check (reminder_preset is null or reminder_preset in ('1d', '2h', '30m', 'custom'));
  end if;
end $$;

-- Force PostgREST to refresh its schema cache so the new columns are usable immediately
-- (otherwise sync can fail with "Could not find the 'reminders_enabled' column ... in the schema cache").
notify pgrst, 'reload schema';
