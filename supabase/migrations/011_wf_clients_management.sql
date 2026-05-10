-- Clients management: extra non-sensitive fields + type label (synced with Dexie Client).

alter table public.wf_clients
  add column if not exists contact_person text,
  add column if not exists postal_code text,
  add column if not exists client_type text not null default 'other';

comment on column public.wf_clients.client_type is
  'company | private | restaurant | shop | other (app-enforced; stored as text)';
