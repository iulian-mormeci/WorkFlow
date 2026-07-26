"use client";

import { Receipt } from "lucide-react";
import { GenericShortcutWidget } from "@/components/dashboard/widgets/generic-shortcut-widget";
import { useTranslations } from "next-intl";

export function WidgetMenuToCsv() {
  const t = useTranslations("dashboard.widgets.menuToCsv");
  return (
    <GenericShortcutWidget
      title={t("title")}
      subtitle={t("subtitle")}
      icon={Receipt}
      href="/menu-to-csv"
      ctaLabel={t("cta")}
    />
  );
}
