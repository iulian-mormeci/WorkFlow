-- Optional per-user preferences (calendar auto-export, future toggles).
alter table public.wf_user_settings
  add column if not exists preferences jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
