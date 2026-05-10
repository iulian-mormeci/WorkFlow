-- Advanced routing: multi-stop route points for interventions.
-- Online-first: each stop is a row, enabling fine-grained Realtime updates + reorder.

create table if not exists public.wf_intervention_stops (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  intervention_id uuid not null references public.wf_interventions (id) on delete cascade,
  sort_index integer not null,
  label text,
  address text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wf_intervention_stops_user_intervention_idx
  on public.wf_intervention_stops (user_id, intervention_id, sort_index);

alter table public.wf_intervention_stops enable row level security;

create policy wf_intervention_stops_select
  on public.wf_intervention_stops
  for select
  using (auth.uid() = user_id);

create policy wf_intervention_stops_insert
  on public.wf_intervention_stops
  for insert
  with check (auth.uid() = user_id);

create policy wf_intervention_stops_update
  on public.wf_intervention_stops
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy wf_intervention_stops_delete
  on public.wf_intervention_stops
  for delete
  using (auth.uid() = user_id);

-- Realtime
alter publication supabase_realtime add table public.wf_intervention_stops;

notify pgrst, 'reload schema';

