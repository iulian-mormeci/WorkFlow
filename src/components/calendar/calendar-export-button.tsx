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
import { useTranslations } from "next-intl";

type Props = {
  event: CalendarEventInput | null;
  filename: string;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary";
  triggerSize?: "default" | "sm" | "lg";
  className?: string;
};

export function CalendarExportButton({
  event,
  filename,
  triggerLabel,
  triggerVariant = "outline",
  triggerSize = "sm",
  className
}: Props) {
  const t = useTranslations("calendar");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  if (!event) return null;

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
        variant={triggerVariant}
        size={triggerSize}
        className={className}
        onClick={() => setOpen(true)}
      >
        <CalendarPlus className="h-4 w-4" />
        {triggerLabel ?? t("exportButton")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("dialog.title")}</DialogTitle>
            <DialogDescription>{t("dialog.subtitle")}</DialogDescription>
          </DialogHeader>
          <div className="mt-2 grid gap-2">
            <Button type="button" className="min-h-12 justify-start gap-3" onClick={handleDownload}>
              <Download className="h-5 w-5 shrink-0" />
              <span className="text-left">
                <span className="block font-medium">{t("dialog.downloadIcs")}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {t("dialog.downloadIcsHint")}
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-12 justify-start gap-3"
              onClick={handleGoogle}
            >
              <ExternalLink className="h-5 w-5 shrink-0" />
              <span className="text-left">
                <span className="block font-medium">{t("dialog.google")}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {t("dialog.googleHint")}
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-12 justify-start gap-3"
              onClick={handleApple}
            >
              <Apple className="h-5 w-5 shrink-0" />
              <span className="text-left">
                <span className="block font-medium">{t("dialog.apple")}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {t("dialog.appleHint")}
                </span>
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
