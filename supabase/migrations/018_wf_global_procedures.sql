-- Shared preset procedures visible to every authenticated user.
-- Only admin/owner accounts may insert, update or delete (see RLS below).
-- Images use wf_attachments (uploaded by admin); SELECT on those rows is allowed when
-- referenced from wf_global_procedures.image_ids.

create or replace function public.workflow_is_global_procedure_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'owner'),
    false
  );
$$;

revoke all on function public.workflow_is_global_procedure_admin() from public;
grant execute on function public.workflow_is_global_procedure_admin() to authenticated;

create table if not exists public.wf_global_procedures (
  id uuid primary key,
  created_by uuid not null references auth.users (id) on delete restrict,
  title text not null,
  category text not null default 'general' check (category in ('general', 'brand_model')),
  brand text,
  model text,
  content text,
  tags jsonb,
  image_ids jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists wf_global_procedures_updated_idx
  on public.wf_global_procedures (updated_at desc);

create index if not exists wf_global_procedures_category_idx
  on public.wf_global_procedures (category);

create index if not exists wf_global_procedures_brand_idx
  on public.wf_global_procedures (brand);

alter table public.wf_global_procedures enable row level security;

-- All signed-in users can read presets (offline pull + search).
create policy wf_global_procedures_select on public.wf_global_procedures
  for select to authenticated
  using (true);

create policy wf_global_procedures_insert on public.wf_global_procedures
  for insert to authenticated
  with check (
    public.workflow_is_global_procedure_admin()
    and created_by = auth.uid()
  );

create policy wf_global_procedures_update on public.wf_global_procedures
  for update to authenticated
  using (public.workflow_is_global_procedure_admin())
  with check (
    public.workflow_is_global_procedure_admin()
    and created_by = auth.uid()
  );

create policy wf_global_procedures_delete on public.wf_global_procedures
  for delete to authenticated
  using (public.workflow_is_global_procedure_admin());

-- Allow reading attachment blobs referenced by global procedures (for all users).
create policy wf_attachments_select_global_procedure_refs on public.wf_attachments
  for select to authenticated
  using (
    exists (
      select 1
      from public.wf_global_procedures g
      where g.image_ids is not null
        and id::text in (
          select jsonb_array_elements_text(g.image_ids)
        )
    )
  );

alter publication supabase_realtime add table public.wf_global_procedures;
alter table public.wf_global_procedures replica identity full;

notify pgrst, 'reload schema';
