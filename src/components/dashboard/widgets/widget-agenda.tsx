"use client";

import { Link } from "@/i18n/navigation";
import { CalendarClock } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBubble } from "@/components/ui/icon";
import { ViewAllLink } from "@/components/dashboard/clickable-card";
import { useCalendarEvents } from "@/lib/calendar/use-calendar-events";
import { useTranslations } from "next-intl";

const LIMIT = 5;

export function WidgetAgenda() {
  const t = useTranslations("dashboard.widgets.agenda");
  const events = useCalendarEvents();

  const upcoming = (events ?? [])
    .filter((e) => !e.completed && e.start.getTime() >= Date.now() - 60 * 60 * 1000)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, LIMIT);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <ViewAllLink href="/agenda" label={t("viewAll")} />
            <IconBubble icon={CalendarClock} />
          </div>
        </div>
      </CardHeader>
      <div className="px-2 pb-2">
        <div className="divide-y overflow-hidden rounded-xl border">
          {upcoming.map((event) => (
            <Link
              key={`${event.kind}-${event.id}`}
              href={event.href}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{event.title || "—"}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {event.start.toLocaleString(undefined, {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                  {event.subtitle ? <> · {event.subtitle}</> : null}
                </div>
              </div>
            </Link>
          ))}

          {upcoming.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t("empty")}</div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
