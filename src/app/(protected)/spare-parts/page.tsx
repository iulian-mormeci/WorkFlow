import { SparePartsClient } from "@/components/spare-parts/spare-parts-client";
import { OfflineBanner } from "@/components/offline/offline-banner";

export default function SparePartsPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Spare Parts</h1>
        <p className="text-sm text-muted-foreground">
          Local warehouse: stock levels update instantly offline.
        </p>
      </header>

      <OfflineBanner />
      <SparePartsClient />
    </div>
  );
}

