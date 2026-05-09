-- WorkFlow PWA cloud sync: tables + RLS + Storage (Section Sync 1)
-- Run in Supabase SQL Editor or via `supabase db push` after linking the project.

-- ---------------------------------------------------------------------------
-- Tables (UUID ids match client-generated Dexie primary keys)
-- ---------------------------------------------------------------------------

create table if not exists public.wf_clients (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  address text,
  city text,
  phone text,
  email text,
  vat_number text,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists wf_clients_user_updated_idx
  on public.wf_clients (user_id, updated_at desc);

create table if not exists public.wf_spare_parts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  sku text not null,
  name text not null,
  unit text,
  min_stock integer,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists wf_spare_parts_user_updated_idx
  on public.wf_spare_parts (user_id, updated_at desc);

create table if not exists public.wf_attachments (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('photo', 'document', 'audio')),
  mime text not null,
  name text,
  size bigint,
  storage_path text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (user_id, storage_path)
);

create index if not exists wf_attachments_user_updated_idx
  on public.wf_attachments (user_id, updated_at desc);

create table if not exists public.wf_interventions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references public.wf_clients (id) on delete restrict,
  created_by uuid references auth.users (id) on delete set null,
  type text not null check (type in ('maintenance', 'repair', 'install', 'other')),
  status text check (status in ('open', 'completed')),
  start_at timestamptz not null,
  end_at timestamptz,
  duration_minutes integer,
  timer_started_at timestamptz,
  km double precision,
  notes text,
  photo_ids uuid[],
  document_ids uuid[],
  voice_note_ids uuid[],
  checklist jsonb,
  spare_parts_used jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists wf_interventions_user_updated_idx
  on public.wf_interventions (user_id, updated_at desc);

create index if not exists wf_interventions_client_idx
  on public.wf_interventions (client_id);

create table if not exists public.wf_stock_movements (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  spare_part_id uuid not null references public.wf_spare_parts (id) on delete cascade,
  type text not null check (type in ('in', 'out', 'adjust')),
  qty double precision not null,
  reason text,
  intervention_id uuid references public.wf_interventions (id) on delete set null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists wf_stock_movements_user_created_idx
  on public.wf_stock_movements (user_id, created_at desc);

create index if not exists wf_stock_movements_user_updated_idx
  on public.wf_stock_movements (user_id, updated_at desc);

create table if not exists public.wf_tickets (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  client_id uuid references public.wf_clients (id) on delete set null,
  intervention_id uuid references public.wf_interventions (id) on delete set null,
  priority text not null check (priority in ('low', 'medium', 'high')),
  status text not null check (status in ('open', 'pending', 'closed')),
  reminder_at timestamptz,
  due_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists wf_tickets_user_updated_idx
  on public.wf_tickets (user_id, updated_at desc);

create table if not exists public.wf_documents (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  intervention_id uuid references public.wf_interventions (id) on delete set null,
  title text not null,
  attachment_id uuid not null references public.wf_attachments (id) on delete restrict,
  page_count integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists wf_documents_user_created_idx
  on public.wf_documents (user_id, created_at desc);

create index if not exists wf_documents_user_updated_idx
  on public.wf_documents (user_id, updated_at desc);

create table if not exists public.wf_support_email_outbox (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('queued', 'sending', 'sent', 'error')),
  to_addr text not null,
  title text not null,
  note text,
  document_id uuid references public.wf_documents (id) on delete set null,
  intervention_id uuid references public.wf_interventions (id) on delete set null,
  attachment_id uuid not null references public.wf_attachments (id) on delete restrict,
  last_error text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists wf_support_email_outbox_user_updated_idx
  on public.wf_support_email_outbox (user_id, updated_at desc);

create table if not exists public.wf_templates (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  client_name text,
  type text not null check (type in ('maintenance', 'repair', 'install', 'other')),
  km double precision,
  notes text,
  checklist jsonb,
  spare_parts_used jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists wf_templates_user_updated_idx
  on public.wf_templates (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.wf_clients enable row level security;
alter table public.wf_spare_parts enable row level security;
alter table public.wf_attachments enable row level security;
alter table public.wf_interventions enable row level security;
alter table public.wf_stock_movements enable row level security;
alter table public.wf_tickets enable row level security;
alter table public.wf_documents enable row level security;
alter table public.wf_support_email_outbox enable row level security;
alter table public.wf_templates enable row level security;

-- wf_clients
create policy wf_clients_select on public.wf_clients for select using (auth.uid() = user_id);
create policy wf_clients_insert on public.wf_clients for insert with check (auth.uid() = user_id);
create policy wf_clients_update on public.wf_clients for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_clients_delete on public.wf_clients for delete using (auth.uid() = user_id);

-- wf_spare_parts
create policy wf_spare_parts_select on public.wf_spare_parts for select using (auth.uid() = user_id);
create policy wf_spare_parts_insert on public.wf_spare_parts for insert with check (auth.uid() = user_id);
create policy wf_spare_parts_update on public.wf_spare_parts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_spare_parts_delete on public.wf_spare_parts for delete using (auth.uid() = user_id);

-- wf_attachments
create policy wf_attachments_select on public.wf_attachments for select using (auth.uid() = user_id);
create policy wf_attachments_insert on public.wf_attachments for insert with check (auth.uid() = user_id);
create policy wf_attachments_update on public.wf_attachments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_attachments_delete on public.wf_attachments for delete using (auth.uid() = user_id);

-- wf_interventions
create policy wf_interventions_select on public.wf_interventions for select using (auth.uid() = user_id);
create policy wf_interventions_insert on public.wf_interventions for insert with check (auth.uid() = user_id);
create policy wf_interventions_update on public.wf_interventions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_interventions_delete on public.wf_interventions for delete using (auth.uid() = user_id);

-- wf_stock_movements
create policy wf_stock_movements_select on public.wf_stock_movements for select using (auth.uid() = user_id);
create policy wf_stock_movements_insert on public.wf_stock_movements for insert with check (auth.uid() = user_id);
create policy wf_stock_movements_update on public.wf_stock_movements for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_stock_movements_delete on public.wf_stock_movements for delete using (auth.uid() = user_id);

-- wf_tickets
create policy wf_tickets_select on public.wf_tickets for select using (auth.uid() = user_id);
create policy wf_tickets_insert on public.wf_tickets for insert with check (auth.uid() = user_id);
create policy wf_tickets_update on public.wf_tickets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_tickets_delete on public.wf_tickets for delete using (auth.uid() = user_id);

-- wf_documents
create policy wf_documents_select on public.wf_documents for select using (auth.uid() = user_id);
create policy wf_documents_insert on public.wf_documents for insert with check (auth.uid() = user_id);
create policy wf_documents_update on public.wf_documents for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_documents_delete on public.wf_documents for delete using (auth.uid() = user_id);

-- wf_support_email_outbox
create policy wf_support_email_outbox_select on public.wf_support_email_outbox for select using (auth.uid() = user_id);
create policy wf_support_email_outbox_insert on public.wf_support_email_outbox for insert with check (auth.uid() = user_id);
create policy wf_support_email_outbox_update on public.wf_support_email_outbox for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_support_email_outbox_delete on public.wf_support_email_outbox for delete using (auth.uid() = user_id);

-- wf_templates
create policy wf_templates_select on public.wf_templates for select using (auth.uid() = user_id);
create policy wf_templates_insert on public.wf_templates for insert with check (auth.uid() = user_id);
create policy wf_templates_update on public.wf_templates for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_templates_delete on public.wf_templates for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage: private bucket "attachments", path layout: {user_id}/{attachment_id}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Storage RLS policies (objects.name = "{user_id}/{attachment_id}/..." or "{user_id}/{attachment_id}")
create policy attachments_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername (name))[1] = auth.uid()::text);

create policy attachments_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername (name))[1] = auth.uid()::text);

create policy attachments_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername (name))[1] = auth.uid()::text)
  with check (bucket_id = 'attachments' and (storage.foldername (name))[1] = auth.uid()::text);

create policy attachments_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername (name))[1] = auth.uid()::text);

-- Optional: enable Realtime later, e.g.:
-- alter publication supabase_realtime add table public.wf_clients;
