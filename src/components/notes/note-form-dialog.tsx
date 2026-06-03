"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Mic, Save } from "lucide-react";
import { db, type Note } from "@/lib/db/workflow-db";
import { createNote, updateNote } from "@/lib/notes/note-mutations";
import { ProcedureEditor } from "@/components/procedures/procedure-editor";
import { VoiceNoteRecorder } from "@/components/voice/voice-note-recorder";
import { VoiceNotesList } from "@/components/voice/voice-notes-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note?: Note | null;
  onSaved?: () => void;
};

export function NoteFormDialog({ open, onOpenChange, note, onSaved }: Props) {
  const t = useTranslations("notes.form");
  const { toast } = useToast();
  const isEdit = Boolean(note);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [voiceNoteIds, setVoiceNoteIds] = useState<string[]>([]);
  const [linkedClientId, setLinkedClientId] = useState("");
  const [linkedInterventionId, setLinkedInterventionId] = useState("");
  const [linkedActivityId, setLinkedActivityId] = useState("");
  const [saving, setSaving] = useState(false);
  const [seedKey, setSeedKey] = useState("new");
  const [draftNoteId, setDraftNoteId] = useState<string | null>(null);

  const clients = useLiveQuery(() => db.clients.orderBy("name").toArray(), []);
  const interventions = useLiveQuery(
    () => db.interventions.orderBy("updatedAt").reverse().limit(200).toArray(),
    []
  );
  const activities = useLiveQuery(
    () => db.activities.orderBy("updatedAt").reverse().limit(200).toArray(),
    []
  );

  const effectiveNoteId = note?.id ?? draftNoteId;

  useEffect(() => {
    if (!open) return;
    setTitle(note?.title ?? "");
    setContent(note?.content ?? "");
    setVoiceNoteIds(note?.voiceNoteIds ?? []);
    setLinkedClientId(note?.linkedClientId ?? "");
    setLinkedInterventionId(note?.linkedInterventionId ?? "");
    setLinkedActivityId(note?.linkedActivityId ?? "");
    setSaving(false);
    setDraftNoteId(note?.id ?? null);
    setSeedKey(note?.id ?? `new-${Date.now()}`);
  }, [open, note]);

  const clientNameById = useMemo(
    () => new Map((clients ?? []).map((c) => [c.id, c.name])),
    [clients]
  );

  async function ensureDraftNoteId(): Promise<string> {
    if (effectiveNoteId) return effectiveNoteId;
    const id = await createNote({
      title: title.trim() || t("untitledDraft"),
      content: "",
      voiceNoteIds: [],
      linkedClientId: linkedClientId || undefined,
      linkedInterventionId: linkedInterventionId || undefined,
      linkedActivityId: linkedActivityId || undefined
    });
    setDraftNoteId(id);
    return id;
  }

  async function save() {
    if (!title.trim()) {
      toast({
        title: t("toasts.titleRequiredTitle"),
        description: t("toasts.titleRequiredBody"),
        variant: "destructive"
      });
      return;
    }
    setSaving(true);
    try {
      const values = {
        title: title.trim(),
        content,
        voiceNoteIds,
        linkedClientId: linkedClientId || undefined,
        linkedInterventionId: linkedInterventionId || undefined,
        linkedActivityId: linkedActivityId || undefined
      };
      if (isEdit && note) {
        await updateNote(note, values);
      } else if (draftNoteId) {
        const row = await db.notes.get(draftNoteId);
        if (row) await updateNote(row, values);
        else await createNote(values);
      } else {
        await createNote(values);
      }
      onOpenChange(false);
      onSaved?.();
      toast({
        title: isEdit ? t("toasts.updatedTitle") : t("toasts.createdTitle"),
        description: t("toasts.savedBody")
      });
    } catch (e) {
      toast({
        title: t("toasts.saveFailedTitle"),
        description: e instanceof Error ? e.message : t("toasts.saveFailedBody"),
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-2xl flex-col overflow-hidden p-0",
          "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:left-0 max-md:max-h-[94dvh] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-2xl"
        )}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3 md:px-6">
          <DialogTitle>{isEdit ? t("titleEdit") : t("titleNew")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4 md:px-6">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="note-title">{t("fields.title")}</Label>
            <Input
              id="note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("fields.titlePlaceholder")}
              className="min-h-12 text-base"
            />
          </div>

          <div className="grid min-w-0 gap-2">
            <Label>{t("fields.content")}</Label>
            <ProcedureEditor
              seedKey={seedKey}
              seedHtml={content}
              onChange={setContent}
              images={[]}
              onPickFiles={() => {}}
              onRemoveImage={() => {}}
              placeholder={t("fields.contentPlaceholder")}
            />
          </div>

          <div className="grid min-w-0 gap-3 rounded-xl border p-3 md:grid-cols-3 md:p-4">
            <div className="grid gap-1">
              <Label className="text-xs">{t("fields.linkClient")}</Label>
              <select
                className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm"
                value={linkedClientId}
                onChange={(e) => setLinkedClientId(e.target.value)}
              >
                <option value="">{t("fields.none")}</option>
                {(clients ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">{t("fields.linkIntervention")}</Label>
              <select
                className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm"
                value={linkedInterventionId}
                onChange={(e) => setLinkedInterventionId(e.target.value)}
              >
                <option value="">{t("fields.none")}</option>
                {(interventions ?? []).map((it) => (
                  <option key={it.id} value={it.id}>
                    {clientNameById.get(it.clientId) ?? "—"} · {it.type}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">{t("fields.linkActivity")}</Label>
              <select
                className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm"
                value={linkedActivityId}
                onChange={(e) => setLinkedActivityId(e.target.value)}
              >
                <option value="">{t("fields.none")}</option>
                {(activities ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2 rounded-xl border bg-muted/30 p-3 md:p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Mic className="h-4 w-4" />
              {t("voiceTitle")}
            </div>
            {effectiveNoteId ? (
              <>
                <VoiceNoteRecorder
                  noteId={effectiveNoteId}
                  onVoiceNoteAdded={(id) =>
                    setVoiceNoteIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
                  }
                />
                <VoiceNotesList noteId={effectiveNoteId} voiceNoteIds={voiceNoteIds} />
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full"
                onClick={() => void ensureDraftNoteId()}
              >
                {t("prepareVoice")}
              </Button>
            )}
          </div>
        </div>

        <div
          className="flex shrink-0 flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:justify-end md:px-6"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <Button type="button" variant="outline" className="min-h-12" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="button" className="min-h-12" disabled={saving} onClick={() => void save()}>
            <Save className="h-4 w-4" />
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
