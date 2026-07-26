"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/workflow-db";
import { CalendarWeekView } from "@/components/agenda/calendar-week-view";
import { AgendaCreateFlow } from "@/components/agenda/agenda-create-flow";
import { ActivityFormDialog } from "@/components/activities/activity-form-dialog";

/**
 * The real /agenda week view, embedded as a dashboard widget — same drag to
 * reschedule, resize to change duration, and click-empty-slot to create as
 * the full page. Keeps its own cursor/dialog state, independent of /agenda.
 */
export function WidgetCalendarWeek() {
  const [cursor, setCursor] = useState(() => new Date());
  const [createPrefill, setCreatePrefill] = useState<Date | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);

  const editingActivity = useLiveQuery(
    async () => (editingActivityId ? await db.activities.get(editingActivityId) : undefined),
    [editingActivityId]
  );

  return (
    <div className="h-full">
      <CalendarWeekView
        cursor={cursor}
        onCursorChange={setCursor}
        onOpenActivity={setEditingActivityId}
        onRequestCreate={setCreatePrefill}
        fitToWorkingHours
      />

      <AgendaCreateFlow prefillDate={createPrefill} onClose={() => setCreatePrefill(null)} />

      <ActivityFormDialog
        open={Boolean(editingActivityId) && editingActivity !== undefined}
        onOpenChange={(o) => {
          if (!o) setEditingActivityId(null);
        }}
        activity={editingActivity ?? null}
      />
    </div>
  );
}
