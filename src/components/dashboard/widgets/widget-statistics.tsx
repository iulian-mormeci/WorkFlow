"use client";

import { LineChart } from "lucide-react";
import { GenericShortcutWidget } from "@/components/dashboard/widgets/generic-shortcut-widget";
import { useTranslations } from "next-intl";

export function WidgetStatistics() {
  const t = useTranslations("dashboard.widgets.statistics");
  return (
    <GenericShortcutWidget
      title={t("title")}
      subtitle={t("subtitle")}
      icon={LineChart}
      href="/statistics"
      ctaLabel={t("cta")}
    />
  );
}
