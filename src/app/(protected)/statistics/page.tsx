import { OfflineBanner } from "@/components/offline/offline-banner";
import { StatisticsClient } from "@/components/statistics/statistics-client";

export default function StatisticsPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Statistics</h1>
        <p className="text-sm text-muted-foreground">
          Monthly overview for CRM traceability.
        </p>
      </header>

      <OfflineBanner />
      <StatisticsClient />
    </div>
  );
}

