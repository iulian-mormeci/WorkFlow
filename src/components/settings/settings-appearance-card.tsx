"use client";

import { Download, Monitor, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBubble } from "@/components/ui/icon";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { useToast } from "@/hooks/use-toast";
import { usePwaInstallPrompt } from "@/hooks/use-pwa-install-prompt";
import { useTranslations } from "next-intl";

export function SettingsAppearanceCard() {
  const t = useTranslations("settings.appearance");
  const { toast } = useToast();
  const { theme, toggle } = useDarkMode();
  const { canInstall, promptInstall } = usePwaInstallPrompt();

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2 p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <IconBubble icon={Monitor} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="outline" onClick={toggle}>
            <Moon className="h-4 w-4" />
            {t("toggleDarkMode", { theme })}
          </Button>
          <Button
            variant="outline"
            disabled={!canInstall}
            onClick={async () => {
              const ok = await promptInstall();
              if (!ok) return;
              toast({ title: t("toasts.installStartedTitle"), description: t("toasts.installStartedBody") });
            }}
          >
            <Download className="h-4 w-4" />
            {t("installPwa")}
          </Button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">{t("tip")}</div>
      </CardHeader>
    </Card>
  );
}
