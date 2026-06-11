/**
 * Authenticated app chrome: sidebar (md+), mobile shell, global search, sync status.
 * Actual auth enforcement is in `middleware.ts`—this layout avoids cookie-mutating
 * Supabase calls so we don’t fight the SSR cookie model.
 */
import { OnlineIndicator } from "@/components/offline/online-indicator";
import { SidebarSignOut } from "@/components/auth/sidebar-sign-out";
import { SyncStatus } from "@/components/sync/sync-status";
import { GlobalSearch } from "@/components/search/global-search";
import { KeyboardShortcutsDialog } from "@/components/shortcuts/keyboard-shortcuts-dialog";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { InterventionRemindersProvider } from "@/components/interventions/intervention-reminders-provider";
import { ActivityRemindersProvider } from "@/components/activities/activity-reminders-provider";
import { TicketRemindersProvider } from "@/components/tickets/ticket-reminders-provider";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { PROTECTED_NAV_ITEMS } from "@/lib/navigation/protected-nav";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { ChatNotificationsProvider } from "@/components/chat/chat-notifications-provider";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

// Protected area must never be statically cached.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProtectedLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  setRequestLocale(locale);
  const t = await getTranslations();
  // Auth protection is enforced by `src/middleware.ts`.
  // No `getUser()` here: refreshing JWTs belongs in middleware / route handlers.
  const userEmail = undefined;

  return (
    <div
      className="min-h-dvh bg-background"
      style={{
        paddingTop: "env(safe-area-inset-top)"
      }}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-3 px-3 py-2 max-md:pt-[3.25rem] md:grid-cols-[260px_1fr] md:gap-4 md:px-5 md:py-5 md:pt-5 lg:px-6 lg:py-6">
        <aside className="hidden rounded-2xl border bg-background p-3.5 md:sticky md:top-5 md:block md:h-[calc(100dvh-2.5rem)] md:overflow-auto lg:p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-base font-semibold tracking-tight">
                {t("common.appName")}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <OnlineIndicator />
                <span className="truncate">
                  {userEmail ? t("protectedShell.signedInAs", { email: userEmail }) : t("protectedShell.signedIn")}
                </span>
              </div>
            </div>
            <SidebarSignOut />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground">{t("protectedShell.languageLabel")}</div>
            <LanguageSwitcher />
          </div>

          <GlobalSearch compact />

          <SyncStatus />

          <SidebarNav items={PROTECTED_NAV_ITEMS} />

          <div className="mt-4 rounded-xl border bg-muted p-2.5 text-xs text-muted-foreground lg:mt-5 lg:p-3">
            {t("protectedShell.offlineFirstNote")}
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            {t("protectedShell.keyboardHint")}
          </div>

          <div className="mt-3">
            <KeyboardShortcutsDialog />
          </div>
        </aside>

        <main
          className="rounded-2xl border bg-background p-3 max-md:pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:p-5 md:pb-5 lg:p-6"
        >
          {/* Client: polls Dexie every 45s for due reminders (notifications + email). */}
          <InterventionRemindersProvider />
          {/* Client: activity reminders (browser notification + in-app postpone prompt). */}
          <ActivityRemindersProvider />
          {/* Client: CRM ticket reminders (pre-due + due browser notifications). */}
          <TicketRemindersProvider />
          {/* Client: global chat Realtime listener — keeps unread badge in sync. */}
          <ChatNotificationsProvider />
          {children}
        </main>
      </div>

      <MobileMenu items={PROTECTED_NAV_ITEMS} />
    </div>
  );
}

