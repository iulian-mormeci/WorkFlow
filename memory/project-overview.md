---
name: project-overview
description: Core architecture of WorkFlowWebApp — stack, auth, key patterns
metadata:
  type: project
---

Next.js 15 App Router PWA for a field technician (personal + small team tool).

**Stack:** React 19, Dexie v22 (IndexedDB offline-first), Supabase (Auth/DB/Storage/Realtime), next-intl IT/EN, TailwindCSS + shadcn/ui (custom minimal), Zustand for auth state.

**Auth/Roles:** `isGlobalProcedureAdmin()` in `src/lib/procedures/global-procedure-admin.ts` checks `user_metadata.role` ("admin"/"owner") OR email matches `NEXT_PUBLIC_WORKFLOW_OWNER_EMAIL`. Role "trusted_contributor" bypasses procedure approval.

**Offline sync:** Dexie is the source of truth locally. `src/lib/sync/sync-engine.ts` reconciles with Supabase via last-writer-wins on `syncedAt`. Attachments go to Supabase Storage. Chat messages are cloud-only (no Dexie).

**Supabase clients:** `createSupabaseBrowserClient()` (returns null if env missing) and `createSupabaseServerClient()` (for RSCs/route handlers). Both return nullable. Admin DB operations use SECURITY DEFINER Postgres functions, no service role key needed.

**Nav:** `PROTECTED_NAV_ITEMS` static array in `src/lib/navigation/protected-nav.ts`. Both sidebar and mobile menu consume the same items. `SidebarIconName` type must match icon map in `sidebar-nav.tsx`.

**Why:** Personal tool for a single technician that expanded to small team; offline-first is critical for field work.
