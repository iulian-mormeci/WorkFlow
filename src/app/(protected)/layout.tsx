import { OnlineIndicator } from "@/components/offline/online-indicator";
import { SidebarSignOut } from "@/components/auth/sidebar-sign-out";
import { SyncStatus } from "@/components/sync/sync-status";
import { GlobalSearch } from "@/components/search/global-search";
import { KeyboardShortcutsDialog } from "@/components/shortcuts/keyboard-shortcuts-dialog";
import { SidebarNav, type SidebarNavItem } from "@/components/layout/sidebar-nav";
import { InterventionRemindersProvider } from "@/components/interventions/intervention-reminders-provider";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";

// Protected area must never be statically cached.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProtectedLayout({
  children
}: {
  children: React.ReactNode;
}) {
  // Auth protection is enforced by `src/middleware.ts`.
  // IMPORTANT: avoid doing an SSR refresh flow in Server Components (they cannot
  // persist refreshed cookies). We keep this layout fast and stable.
  const userEmail = undefined;

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
    <div
      className="min-h-dvh bg-background"
      style={{
        paddingTop: "env(safe-area-inset-top)"
      }}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-3 py-3 md:grid-cols-[300px_1fr] md:px-6 md:py-6">
        <aside className="hidden rounded-2xl border bg-background p-4 md:sticky md:top-6 md:block md:h-[calc(100dvh-3rem)] md:overflow-auto">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-base font-semibold tracking-tight">
                WorkFlow
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <OnlineIndicator />
                <span className="truncate">
                  {userEmail ? `Signed in as ${userEmail}` : "Signed in"}
                </span>
              </div>
            </div>
            <SidebarSignOut />
          </div>

          <GlobalSearch />

          <SyncStatus />

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

        <main className="rounded-2xl border bg-background p-4 pb-32 md:p-6 md:pb-6">
          {/* Client: polls Dexie every 45s for due reminders (notifications + email). */}
          <InterventionRemindersProvider />
          {children}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}

