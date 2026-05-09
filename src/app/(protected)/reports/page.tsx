import { MonthlyCrmExport } from "@/components/reports/monthly-crm-export";
import { OfflineBanner } from "@/components/offline/offline-banner";

export default function ReportsPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Simple exports for CRM reporting (offline-first).
        </p>
      </header>

      <OfflineBanner />
      <MonthlyCrmExport />
    </div>
  );
}

