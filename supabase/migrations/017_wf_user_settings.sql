-- Per-user settings (working hours with split slots + breaks). One row per user.
-- Synced via Dexie ↔ Supabase with realtime (same pattern as wf_activities).

create table if not exists public.wf_user_settings (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  working_hours jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint wf_user_settings_user_id_key unique (user_id),
  constraint wf_user_settings_id_user_id_match check (id = user_id)
);

create index if not exists wf_user_settings_user_updated_idx
  on public.wf_user_settings (user_id, updated_at desc);

alter table public.wf_user_settings enable row level security;

create policy wf_user_settings_select on public.wf_user_settings
  for select using (auth.uid() = user_id);
create policy wf_user_settings_insert on public.wf_user_settings
  for insert with check (auth.uid() = user_id);
create policy wf_user_settings_update on public.wf_user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_user_settings_delete on public.wf_user_settings
  for delete using (auth.uid() = user_id);

alter publication supabase_realtime add table public.wf_user_settings;
alter table public.wf_user_settings replica identity full;

notify pgrst, 'reload schema';
