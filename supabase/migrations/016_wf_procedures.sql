-- WorkFlow "Procedure & Troubleshooting": stored technical guides and troubleshooting docs.
-- Mirrors the wf_activities standards (per-user RLS, realtime, FULL replica identity for deletes).
-- Images are stored as wf_attachments (kind 'photo') and referenced by image_ids.

create table if not exists public.wf_procedures (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  category text not null default 'general' check (category in ('general', 'brand_model')),
  brand text,
  model text,
  -- Sanitized rich-text body (HTML).
  content text,
  -- Free-form tags: ["pump", "no-power", ...]
  tags jsonb,
  -- Referenced attachment ids (kind 'photo'): ["uuid", ...]
  image_ids jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists wf_procedures_user_updated_idx
  on public.wf_procedures (user_id, updated_at desc);

create index if not exists wf_procedures_user_category_idx
  on public.wf_procedures (user_id, category);

create index if not exists wf_procedures_user_brand_idx
  on public.wf_procedures (user_id, brand);

create index if not exists wf_procedures_user_model_idx
  on public.wf_procedures (user_id, model);

-- ---------------------------------------------------------------------------
-- Row Level Security (same per-user isolation as every other wf_* table)
-- ---------------------------------------------------------------------------

alter table public.wf_procedures enable row level security;

create policy wf_procedures_select on public.wf_procedures
  for select using (auth.uid() = user_id);
create policy wf_procedures_insert on public.wf_procedures
  for insert with check (auth.uid() = user_id);
create policy wf_procedures_update on public.wf_procedures
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_procedures_delete on public.wf_procedures
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime: stream changes + include user_id in DELETE payloads (filter match)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.wf_procedures;
alter table public.wf_procedures replica identity full;

-- Refresh PostgREST schema cache so the new table is usable immediately.
notify pgrst, 'reload schema';
