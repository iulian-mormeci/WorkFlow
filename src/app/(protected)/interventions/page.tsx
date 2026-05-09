import { InterventionsClient } from "@/components/interventions/interventions-client";
import { OfflineBanner } from "@/components/offline/offline-banner";

export default function InterventionsPage() {
  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Interventions</h1>
          <p className="text-sm text-muted-foreground">
            Offline-first list with quick filters.
          </p>
        </div>
      </header>

      <OfflineBanner />
      <InterventionsClient />
    </div>
  );
}

