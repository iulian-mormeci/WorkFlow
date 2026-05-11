"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { usePwaInstallPrompt } from "@/hooks/use-pwa-install-prompt";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";

export function InstallPromptBanner() {
  const t = useTranslations();
  const { toast } = useToast();
  const { canInstall, promptInstall } = usePwaInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("workflow:installBannerDismissed") === "1") {
        setDismissed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const onDismiss = useCallback(() => {
    localStorage.setItem("workflow:installBannerDismissed", "1");
    setDismissed(true);
  }, []);

  const onInstall = useCallback(async () => {
    const ok = await promptInstall();
    if (ok) toast({ title: t("pwa.installStartedTitle"), description: t("pwa.installStartedBody") });
  }, [promptInstall, toast]);

  if (!canInstall || dismissed) return null;

  return (
    <div className="rounded-2xl border bg-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{t("pwa.bannerTitle")}</div>
          <div className="text-xs text-muted-foreground">
            {t("pwa.bannerBody")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onDismiss}>
            {t("common.notNow")}
          </Button>
          <Button onClick={onInstall}>
            <Download className="h-4 w-4" />
            {t("common.install")}
          </Button>
        </div>
      </div>
    </div>
  );
}

