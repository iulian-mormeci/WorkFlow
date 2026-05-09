"use client";

import { useState } from "react";
import { Mic, NotebookPen, Save } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VoiceNoteRecorder } from "@/components/voice/voice-note-recorder";
import { useToast } from "@/hooks/use-toast";

type Props = {
  interventionId?: string;
};

export function QuickNoteFab({ interventionId }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveText() {
    if (!interventionId) {
      toast({
        title: "Select an intervention",
        description: "Quick Note on dashboard is voice-only for now.",
        variant: "destructive"
      });
      return;
    }
    const v = text.trim();
    if (!v) return;
    setSaving(true);
    try {
      const it = await db.interventions.get(interventionId);
      if (!it) throw new Error("Intervention not found");
      const nowIso = new Date().toISOString();
      const next = it.notes ? `${it.notes}\n\n${v}` : v;
      await db.interventions.update(interventionId, { notes: next, updatedAt: nowIso });
      toast({ title: "Note saved", description: "Added to intervention notes." });
      setText("");
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? "Could not save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/10 transition-transform active:scale-[0.98] md:bottom-8 md:right-8"
        aria-label="Quick note"
      >
        <NotebookPen className="h-6 w-6" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quick note</DialogTitle>
          </DialogHeader>

          <div className="mt-3 grid gap-4">
            {interventionId ? (
              <div className="grid gap-2">
                <div className="text-sm font-semibold">Text</div>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Add a quick note…"
                />
                <div className="flex justify-end">
                  <Button disabled={saving || text.trim().length === 0} onClick={saveText} type="button">
                    <Save className="h-4 w-4" />
                    Save text
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border bg-muted p-4 text-sm text-muted-foreground">
                Dashboard quick note currently supports voice notes. Open an intervention to add a text quick note.
              </div>
            )}

            <div className="grid gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Mic className="h-4 w-4" />
                Voice
              </div>
              {interventionId ? (
                <VoiceNoteRecorder interventionId={interventionId} />
              ) : (
                <div className="rounded-2xl border bg-muted p-4 text-sm text-muted-foreground">
                  Open an intervention to attach voice notes to it.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

