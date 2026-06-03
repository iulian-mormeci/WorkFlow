-- WorkFlow standalone notes (text + optional voice attachment refs, optional entity links).

create table if not exists public.wf_notes (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  content text,
  voice_note_ids jsonb,
  linked_client_id uuid references public.wf_clients (id) on delete set null,
  linked_intervention_id uuid references public.wf_interventions (id) on delete set null,
  linked_activity_id uuid references public.wf_activities (id) on delete set null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists wf_notes_user_updated_idx
  on public.wf_notes (user_id, updated_at desc);

create index if not exists wf_notes_user_linked_intervention_idx
  on public.wf_notes (user_id, linked_intervention_id);

alter table public.wf_notes enable row level security;

create policy wf_notes_select on public.wf_notes
  for select using (auth.uid() = user_id);
create policy wf_notes_insert on public.wf_notes
  for insert with check (auth.uid() = user_id);
create policy wf_notes_update on public.wf_notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_notes_delete on public.wf_notes
  for delete using (auth.uid() = user_id);

alter publication supabase_realtime add table public.wf_notes;
alter table public.wf_notes replica identity full;

notify pgrst, 'reload schema';
