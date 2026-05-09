import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { OnlineIndicator } from "@/components/offline/online-indicator";
import { GlobalSearch } from "@/components/search/global-search";
import { KeyboardShortcutsDialog } from "@/components/shortcuts/keyboard-shortcuts-dialog";
import { SidebarNav, type SidebarNavItem } from "@/components/layout/sidebar-nav";

export default async function ProtectedLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  // Auth protection is enforced by `src/middleware.ts`.
  // We keep this layout server-rendered for fast navigation and only use Supabase
  // here to optionally display the user's email when available.
  const user =
    supabase
      ? (await supabase.auth.getUser()).data.user
      : null;

  const nav: readonly SidebarNavItem[] = [
    { href: "/dashboard", label: "Home", iconName: "home" },
    { href: "/interventions", label: "Interventions", iconName: "interventions" },
    { href: "/templates", label: "Templates", iconName: "templates" },
    { href: "/documents", label: "Documents", iconName: "documents" },
    { href: "/crm-tickets", label: "CRM Tickets", iconName: "crmTickets" },
    { href: "/clients", label: "Clients", iconName: "clients" },
    { href: "/spare-parts", label: "Spare Parts", iconName: "spareParts" },
    { href: "/reports", label: "Reports", iconName: "reports" },
    { href: "/statistics", label: "Statistics", iconName: "statistics" },
    { href: "/settings", label: "Settings", iconName: "settings" }
  ] as const;

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-4 md:grid-cols-[300px_1fr] md:px-6 md:py-6">
        <aside className="rounded-2xl border bg-background p-4 md:sticky md:top-6 md:h-[calc(100dvh-3rem)] md:overflow-auto">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-base font-semibold tracking-tight">
                WorkFlow
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <OnlineIndicator />
                <span className="truncate">
                  {user?.email ? `Signed in as ${user.email}` : "Signed in"}
                </span>
              </div>
            </div>
            <Link className="text-sm underline" href="/auth/logout">
              Sign out
            </Link>
          </div>

          <GlobalSearch />

          <SidebarNav items={nav} />

          <div className="mt-6 rounded-xl border bg-muted p-3 text-xs text-muted-foreground">
            Offline-first. Data is stored locally and can sync later.
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            Keyboard (iPad): <span className="font-mono">⌘K</span> search •{" "}
            <span className="font-mono">⌘R</span> reload
          </div>

          <div className="mt-3">
            <KeyboardShortcutsDialog />
          </div>
        </aside>

        <main className="rounded-2xl border bg-background p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

