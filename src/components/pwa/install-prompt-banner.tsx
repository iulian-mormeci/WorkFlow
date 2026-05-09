"use client";

import { useCallback, useState } from "react";
import { Download } from "lucide-react";
import { usePwaInstallPrompt } from "@/hooks/use-pwa-install-prompt";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function InstallPromptBanner() {
  const { toast } = useToast();
  const { canInstall, promptInstall } = usePwaInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("workflow:installBannerDismissed") === "1";
  });

  const onDismiss = useCallback(() => {
    localStorage.setItem("workflow:installBannerDismissed", "1");
    setDismissed(true);
  }, []);

  const onInstall = useCallback(async () => {
    const ok = await promptInstall();
    if (ok) toast({ title: "Install started", description: "Follow the prompt." });
  }, [promptInstall, toast]);

  if (!canInstall || dismissed) return null;

  return (
    <div className="rounded-2xl border bg-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Install WorkFlow</div>
          <div className="text-xs text-muted-foreground">
            Add it to your Home Screen for a faster, app-like experience.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onDismiss}>
            Not now
          </Button>
          <Button onClick={onInstall}>
            <Download className="h-4 w-4" />
            Install
          </Button>
        </div>
      </div>
    </div>
  );
}

