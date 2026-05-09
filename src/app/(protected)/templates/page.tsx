import { OfflineBanner } from "@/components/offline/offline-banner";
import { TemplatesClient } from "@/components/templates/templates-client";

export default function TemplatesPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <p className="text-sm text-muted-foreground">
          Full template library: job type, field vs office activity, default client, checklist, spare parts,
          and one-tap &quot;Create from template&quot;.
        </p>
      </header>

      <OfflineBanner />
      <TemplatesClient />
    </div>
  );
}

