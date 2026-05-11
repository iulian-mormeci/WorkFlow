"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";
import { useTranslations } from "next-intl";

export function OfflineBanner() {
  const t = useTranslations();
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="mb-4 rounded-xl border bg-muted px-4 py-3 text-sm">
      <div className="font-medium">{t("offline.title")}</div>
      <div className="text-muted-foreground">
        {t("offline.body")}
      </div>
    </div>
  );
}

