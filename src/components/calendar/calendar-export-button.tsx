"use client";

import { useState } from "react";
import { Apple, CalendarPlus, Download, ExternalLink } from "lucide-react";
import type { CalendarEventInput } from "@/lib/calendar/ics-export";
import {
  buildIcs,
  downloadIcsFile,
  openAppleCalendarDownload,
  openGoogleCalendar
} from "@/lib/calendar/ics-export";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type Props = {
  event: CalendarEventInput | null;
  filename: string;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary";
  triggerSize?: "default" | "sm" | "lg";
  /** Full-width highlighted CTA for detail pages. */
  prominent?: boolean;
  className?: string;
};

function formatEventWhen(event: CalendarEventInput): string | null {
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return null;
  const end = event.end ? new Date(event.end) : null;
  const startStr = start.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
  if (!end || Number.isNaN(end.getTime())) return startStr;
  const sameDay = start.toDateString() === end.toDateString();
  const endStr = end.toLocaleString(undefined, {
    ...(sameDay ? {} : { weekday: "short", day: "numeric", month: "short" }),
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${startStr} – ${endStr}`;
}

export function CalendarExportButton({
  event,
  filename,
  triggerLabel,
  triggerVariant = "outline",
  triggerSize = "sm",
  prominent = false,
  className
}: Props) {
  const t = useTranslations("calendar");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  if (!event) return null;

  const whenLabel = formatEventWhen(event);

  function handleDownload() {
    const ics = buildIcs(event!);
    downloadIcsFile(filename, ics);
    toast({ title: t("toasts.downloadedTitle"), description: t("toasts.downloadedBody") });
    setOpen(false);
  }

  function handleGoogle() {
    openGoogleCalendar(event!);
    setOpen(false);
  }

  function handleApple() {
    const ics = buildIcs(event!);
    openAppleCalendarDownload(filename, ics);
    toast({ title: t("toasts.appleTitle"), description: t("toasts.appleBody") });
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant={prominent ? "secondary" : triggerVariant}
        size={prominent ? "lg" : triggerSize}
        className={cn(
          prominent &&
            "min-h-12 w-full gap-2 border-emerald-200/80 bg-emerald-50 text-emerald-950 shadow-sm hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-50 dark:hover:bg-emerald-950/50 sm:w-auto",
          className
        )}
        onClick={() => setOpen(true)}
      >
        <CalendarPlus className={cn("shrink-0", prominent ? "h-5 w-5" : "h-4 w-4")} />
        {triggerLabel ?? t("exportButton")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="space-y-2 border-b px-4 py-4 sm:px-5">
            <DialogTitle>{t("dialog.title")}</DialogTitle>
            <DialogDescription>{t("dialog.subtitle")}</DialogDescription>
            <div className="rounded-xl border bg-muted/40 px-3 py-2.5 text-left">
              <p className="text-sm font-medium leading-snug">{event.title}</p>
              {whenLabel ? (
                <p className="mt-1 text-xs text-muted-foreground">{whenLabel}</p>
              ) : null}
            </div>
          </DialogHeader>
          <div className="grid gap-2 p-4 sm:p-5">
            <button
              type="button"
              className="flex min-h-[3.25rem] touch-manipulation items-start gap-3 rounded-xl border bg-background p-3 text-left transition hover:bg-muted/50 active:scale-[0.99]"
              onClick={handleDownload}
            >
              <Download className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span>
                <span className="block text-sm font-medium">{t("dialog.downloadIcs")}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t("dialog.downloadIcsHint")}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="flex min-h-[3.25rem] touch-manipulation items-start gap-3 rounded-xl border bg-background p-3 text-left transition hover:bg-muted/50 active:scale-[0.99]"
              onClick={handleGoogle}
            >
              <ExternalLink className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span>
                <span className="block text-sm font-medium">{t("dialog.google")}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t("dialog.googleHint")}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="flex min-h-[3.25rem] touch-manipulation items-start gap-3 rounded-xl border bg-background p-3 text-left transition hover:bg-muted/50 active:scale-[0.99]"
              onClick={handleApple}
            >
              <Apple className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span>
                <span className="block text-sm font-medium">{t("dialog.apple")}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t("dialog.appleHint")}
                </span>
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
