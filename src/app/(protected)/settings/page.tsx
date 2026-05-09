import { SettingsClient } from "@/components/settings/settings-client";
import { OfflineBanner } from "@/components/offline/offline-banner";

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile and offline data.
        </p>
      </header>

      <OfflineBanner />
      <SettingsClient />
    </div>
  );
}

