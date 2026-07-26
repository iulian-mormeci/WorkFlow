"use client";

import { BarChart3 } from "lucide-react";
import { GenericShortcutWidget } from "@/components/dashboard/widgets/generic-shortcut-widget";
import { useTranslations } from "next-intl";

export function WidgetReports() {
  const t = useTranslations("dashboard.widgets.reports");
  return (
    <GenericShortcutWidget
      title={t("title")}
      subtitle={t("subtitle")}
      icon={BarChart3}
      href="/reports"
      ctaLabel={t("cta")}
    />
  );
}
