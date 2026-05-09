import { OfflineBanner } from "@/components/offline/offline-banner";
import { TemplatesClient } from "@/components/templates/templates-client";

export default function TemplatesPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <p className="text-sm text-muted-foreground">
          Save recurring interventions and create them in one tap.
        </p>
      </header>

      <OfflineBanner />
      <TemplatesClient />
    </div>
  );
}

