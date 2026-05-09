import { OfflineBanner } from "@/components/offline/offline-banner";
import { DocumentsArchive } from "@/components/documents/documents-archive";

export default function DocumentsPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Your scanned PDFs archive (offline-first).
        </p>
      </header>

      <OfflineBanner />
      <DocumentsArchive />
    </div>
  );
}

