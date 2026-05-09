"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="mb-4 rounded-xl border bg-muted px-4 py-3 text-sm">
      <div className="font-medium">Offline mode</div>
      <div className="text-muted-foreground">
        You can keep working. Changes are saved locally and will sync when
        you’re back online.
      </div>
    </div>
  );
}

