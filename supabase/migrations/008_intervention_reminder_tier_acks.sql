-- Separate ack timestamps per reminder tier (pre-due vs due/overdue).

alter table public.wf_interventions
  add column if not exists reminder_pre_due_ack_at timestamptz;

alter table public.wf_interventions
  add column if not exists reminder_due_ack_at timestamptz;

notify pgrst, 'reload schema';
