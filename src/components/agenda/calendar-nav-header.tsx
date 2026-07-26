"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export function CalendarNavHeader({
  label,
  onPrev,
  onNext,
  onToday
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const t = useTranslations("agenda");
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <div className="text-sm font-semibold capitalize">{label}</div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" onClick={onToday}>
          {t("todayButton")}
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={onPrev} aria-label={t("prevAria")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={onNext} aria-label={t("nextAria")}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
