"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Trash2 } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { deleteVoiceAttachmentRemote } from "@/lib/sync/cloud-delete";

export function VoiceNotesList({ interventionId }: { interventionId: string }) {
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();
  const intervention = useLiveQuery(async () => db.interventions.get(interventionId), [
    interventionId,
    liveEpoch
  ]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    return () => {
      for (const u of urls.values()) URL.revokeObjectURL(u);
    };
  }, [urls]);

  const items = useLiveQuery(async () => {
    const ids = intervention?.voiceNoteIds ?? [];
    if (!ids.length) return [];
    const atts = await db.attachments.bulkGet(ids);
    return atts
      .filter(Boolean)
      .map((a) => a!)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [intervention?.voiceNoteIds?.join(",") ?? "", liveEpoch]);

  useEffect(() => {
    (async () => {
      const next = new Map<string, string>();
      for (const a of items ?? []) {
        const url = URL.createObjectURL(a.blob);
        next.set(a.id, url);
      }
      // revoke old
      for (const [id, u] of urls.entries()) {
        if (!next.has(id)) URL.revokeObjectURL(u);
      }
      setUrls(next);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items?.map((x) => x.id).join(",")]);

  const list = items ?? [];

  return (
    <div className="grid gap-2 rounded-2xl border bg-background p-4">
      <div className="text-sm font-semibold">Saved voice notes</div>
      {list.length === 0 ? (
        <div className="rounded-xl border bg-muted px-4 py-3 text-sm text-muted-foreground">
          No voice notes yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {list.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-3 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {new Date(a.createdAt).toLocaleString()}
                </div>
                <div className="mt-1">
                  <audio controls src={urls.get(a.id)} />
                </div>
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  if (
                    !confirm(
                      "Delete this voice note from this device and from the cloud (when online)?"
                    )
                  ) {
                    return;
                  }
                  try {
                    const supabase = createSupabaseBrowserClient();
                    const {
                      data: { user }
                    } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
                    if (supabase && user && typeof navigator !== "undefined" && navigator.onLine) {
                      await deleteVoiceAttachmentRemote(supabase, user.id, {
                        attachmentId: a.id,
                        interventionId
                      });
                    }
                    const nowIso = new Date().toISOString();
                    await db.attachments.delete(a.id);
                    const prev = intervention?.voiceNoteIds ?? [];
                    await db.interventions.update(interventionId, {
                      voiceNoteIds: prev.filter((x) => x !== a.id),
                      updatedAt: nowIso
                    });
                    toast({ title: "Deleted", description: "Voice note removed." });
                  } catch (e: any) {
                    toast({
                      title: "Delete failed",
                      description: e?.message ?? "Could not delete",
                      variant: "destructive"
                    });
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

