---
name: project-approval-chat
description: Global procedure approval workflow, admin page, and internal chat — added Jun 2025
metadata:
  type: project
---

Three features added in June 2025. All require running the two new Supabase migrations before using.

**Migrations to apply:**
- `supabase/migrations/022_wf_procedure_approval.sql` — adds status/rejection_reason/reviewed_by columns to wf_global_procedures; new RLS (any user can submit pending; trusted_contributor and admin publish directly); SECURITY DEFINER functions: workflow_admin_list_users(), workflow_admin_set_user_role(), workflow_admin_stats().
- `supabase/migrations/023_wf_chat_messages.sql` — new wf_messages table; RLS allows sender/receiver to see own messages, admin sees all; Realtime enabled.

**Feature 1 — Approval workflow:** Checkbox "Proponi come procedura globale" in ProcedureFormDialog (create mode only). Calls `submitProcedureForGlobal()` in `src/lib/procedures/submit-global-procedure.ts`. Admin/trusted_contributor → status=approved; others → status=pending. Dexie globalProcedures upgraded to v22 with status index.

**Feature 2 — Admin page:** `/admin` route (server component, redirects non-admins to /dashboard). Client component at `src/components/admin/admin-client.tsx`. Three tabs: Pending Procedures (default), Users, Stats. Uses RPC functions for user list and role updates. No service role key needed.

**Feature 3 — Chat:** `/chat` route. Cloud-only (no Dexie), real-time via Supabase Realtime channel. Admin sees all threads; users send to null receiver_id (admin channel). Component at `src/components/chat/chat-client.tsx`. Messages send on Enter (Shift+Enter = newline).

**Why:** Admin needed to review and publish community-contributed procedures; chat enables async coordination about specific procedures.
**How to apply:** After merging, run both SQL migrations against the Supabase project before any user accesses the new routes.
