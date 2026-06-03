import { db, type Note } from "@/lib/db/workflow-db";
import { sanitizeProcedureHtml } from "@/lib/procedures/sanitize-html";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";

export type NoteFormValues = {
  title: string;
  content?: string;
  voiceNoteIds: string[];
  linkedClientId?: string;
  linkedInterventionId?: string;
  linkedActivityId?: string;
};

function cleanId(id: string | undefined | null): string | undefined {
  const v = id?.trim();
  return v ? v : undefined;
}

export async function createNote(values: NoteFormValues): Promise<string> {
  const nowIso = new Date().toISOString();
  const id = crypto.randomUUID();
  const row: Note = {
    id,
    title: values.title.trim(),
    content: values.content?.trim() ? sanitizeProcedureHtml(values.content) : undefined,
    voiceNoteIds: values.voiceNoteIds.length ? values.voiceNoteIds : undefined,
    linkedClientId: cleanId(values.linkedClientId),
    linkedInterventionId: cleanId(values.linkedInterventionId),
    linkedActivityId: cleanId(values.linkedActivityId),
    createdAt: nowIso,
    updatedAt: nowIso
  };
  await db.notes.add(row);
  scheduleWorkflowSync();
  return id;
}

export async function updateNote(current: Note, values: NoteFormValues): Promise<void> {
  const nowIso = new Date().toISOString();
  await db.notes.update(current.id, {
    title: values.title.trim(),
    content: values.content?.trim() ? sanitizeProcedureHtml(values.content) : undefined,
    voiceNoteIds: values.voiceNoteIds.length ? values.voiceNoteIds : undefined,
    linkedClientId: cleanId(values.linkedClientId),
    linkedInterventionId: cleanId(values.linkedInterventionId),
    linkedActivityId: cleanId(values.linkedActivityId),
    updatedAt: nowIso
  });
  scheduleWorkflowSync();
}
