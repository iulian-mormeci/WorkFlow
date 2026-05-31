-- WorkFlow "Attività" (Activities): a general, flexible personal task list.
-- Mirrors the wf_tickets standards (per-user RLS, realtime, FULL replica identity for deletes).

create table if not exists public.wf_activities (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  reminders_enabled boolean not null default false,
  reminder_preset text check (reminder_preset in ('1d', '2h', '30m', 'custom')),
  reminder_custom_at timestamptz,
  reminder_pre_due_ack_at timestamptz,
  reminder_due_ack_at timestamptz,
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'postponed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  category text,
  -- Append-only postponement log: [{ id, at, reason, previousDueAt, newDueAt }]
  postponements jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists wf_activities_user_updated_idx
  on public.wf_activities (user_id, updated_at desc);

create index if not exists wf_activities_user_due_idx
  on public.wf_activities (user_id, due_at);

create index if not exists wf_activities_user_status_idx
  on public.wf_activities (user_id, status);

-- ---------------------------------------------------------------------------
-- Row Level Security (same per-user isolation as every other wf_* table)
-- ---------------------------------------------------------------------------

alter table public.wf_activities enable row level security;

create policy wf_activities_select on public.wf_activities
  for select using (auth.uid() = user_id);
create policy wf_activities_insert on public.wf_activities
  for insert with check (auth.uid() = user_id);
create policy wf_activities_update on public.wf_activities
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_activities_delete on public.wf_activities
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime: stream changes + include user_id in DELETE payloads (filter match)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.wf_activities;
alter table public.wf_activities replica identity full;

-- Refresh PostgREST schema cache so the new table is usable immediately.
notify pgrst, 'reload schema';
