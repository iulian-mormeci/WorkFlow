import { OfflineBanner } from "@/components/offline/offline-banner";
import { CrmTicketsClient } from "@/components/tickets/crm-tickets-client";

export default function CrmTicketsPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">CRM Tickets</h1>
        <p className="text-sm text-muted-foreground">
          Track follow-ups and reminders (offline-first).
        </p>
      </header>

      <OfflineBanner />
      <CrmTicketsClient />
    </div>
  );
}

