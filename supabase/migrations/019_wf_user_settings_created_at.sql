-- wf_user_settings may exist without created_at if 017 ran with IF NOT EXISTS on an older table.
alter table public.wf_user_settings
  add column if not exists created_at timestamptz;

update public.wf_user_settings
set created_at = coalesce(created_at, updated_at, now())
where created_at is null;

alter table public.wf_user_settings
  alter column created_at set default now();

alter table public.wf_user_settings
  alter column created_at set not null;

notify pgrst, 'reload schema';
