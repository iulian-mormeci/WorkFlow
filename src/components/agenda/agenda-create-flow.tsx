"use client";

import { useState } from "react";
import { ClipboardList, ListTodo } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InterventionFormDialog } from "@/components/interventions/intervention-form-dialog";
import { ActivityFormDialog } from "@/components/activities/activity-form-dialog";
import { useTranslations } from "next-intl";

/** Local `yyyy-MM-ddTHH:mm` for datetime-local inputs (mirrors intervention-form-dialog.tsx). */
function toLocalDateTimeInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * "What do you want to add?" chooser, shown whenever the Agenda is asked to
 * create something at a given date/time (toolbar + button, a click on an
 * empty month cell, or an empty week-view slot). Mounted once at the
 * AgendaClient level so it works no matter which view is active.
 */
export function AgendaCreateFlow({
  prefillDate,
  onClose
}: {
  prefillDate: Date | null;
  onClose: () => void;
}) {
  const t = useTranslations("agenda.create");
  const [kind, setKind] = useState<"intervention" | "activity" | null>(null);

  const reset = () => {
    setKind(null);
    onClose();
  };

  if (!prefillDate) return null;

  return (
    <>
      <Dialog open={!kind} onOpenChange={(o) => { if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("chooserTitle")}</DialogTitle>
            <DialogDescription>{t("chooserSubtitle")}</DialogDescription>
          </DialogHeader>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              onClick={() => setKind("intervention")}
            >
              <ClipboardList className="h-5 w-5" />
              {t("newIntervention")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              onClick={() => setKind("activity")}
            >
              <ListTodo className="h-5 w-5" />
              {t("newActivity")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <InterventionFormDialog
        open={kind === "intervention"}
        onOpenChange={(o) => { if (!o) reset(); }}
        mode="new"
        initial={{ formPreset: "client", defaultStartAt: toLocalDateTimeInputValue(prefillDate) }}
        onSaved={() => reset()}
      />

      <ActivityFormDialog
        open={kind === "activity"}
        onOpenChange={(o) => { if (!o) reset(); }}
        initialDueAt={prefillDate.toISOString()}
        onSaved={() => reset()}
      />
    </>
  );
}
