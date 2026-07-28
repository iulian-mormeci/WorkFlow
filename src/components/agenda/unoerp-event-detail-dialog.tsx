"use client";

import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CalendarEvent } from "@/lib/calendar/use-calendar-events";
import { unoErpPriorityClassName } from "@/lib/unoerp/color";
import { useTranslations } from "next-intl";

type Props = {
  event: CalendarEvent | null;
  onOpenChange: (open: boolean) => void;
};

/** Read-only detail view for a synced UnoERP event — no edit/delete, per the integration's scope. */
export function UnoErpEventDetailDialog({ event, onOpenChange }: Props) {
  const t = useTranslations("agenda.unoerp.detail");

  return (
    <Dialog open={Boolean(event)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {event ? (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-violet-300 bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100">
                  <Globe className="mr-1 h-3 w-3" />
                  ERP
                </Badge>
                <DialogTitle className="text-left">{event.title || "—"}</DialogTitle>
              </div>
            </DialogHeader>

            <div className="mt-2 space-y-3 text-sm">
              {event.subtitle ? (
                <div>
                  <div className="text-xs font-medium text-muted-foreground">{t("clientLabel")}</div>
                  <div>{event.subtitle}</div>
                </div>
              ) : null}
              {event.category ? (
                <div>
                  <div className="text-xs font-medium text-muted-foreground">{t("categoryLabel")}</div>
                  <div>{event.category}</div>
                </div>
              ) : null}
              {event.ticketType ? (
                <div>
                  <div className="text-xs font-medium text-muted-foreground">{t("typeLabel")}</div>
                  <div>{event.ticketType}</div>
                </div>
              ) : null}
              {event.priority ? (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">{t("priorityLabel")}</div>
                  <Badge className={unoErpPriorityClassName(event.priority)}>{event.priority}</Badge>
                </div>
              ) : null}
              {event.description ? (
                <div>
                  <div className="text-xs font-medium text-muted-foreground">{t("notesLabel")}</div>
                  <p className="whitespace-pre-line">{event.description}</p>
                </div>
              ) : null}
            </div>

            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">{t("readOnlyNote")}</p>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
