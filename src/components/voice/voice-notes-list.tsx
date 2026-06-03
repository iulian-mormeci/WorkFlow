"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Trash2 } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  performStandaloneAttachmentCloudDelete,
  performVoiceAttachmentCloudSyncDelete
} from "@/lib/sync/cloud-delete";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";
import { useTranslations } from "next-intl";

type Props = {
  interventionId?: string;
  noteId?: string;
  voiceNoteIds?: string[];
};

export function VoiceNotesList({ interventionId, noteId, voiceNoteIds: voiceIdsProp }: Props) {
  const t = useTranslations();
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();
  const intervention = useLiveQuery(
    async () => (interventionId ? db.interventions.get(interventionId) : undefined),
    [interventionId, liveEpoch]
  );
  const note = useLiveQuery(async () => (noteId ? db.notes.get(noteId) : undefined), [noteId, liveEpoch]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    return () => {
      for (const u of urls.values()) URL.revokeObjectURL(u);
    };
  }, [urls]);

  const items = useLiveQuery(async () => {
    const ids =
      voiceIdsProp ?? intervention?.voiceNoteIds ?? note?.voiceNoteIds ?? [];
    if (!ids.length) return [];
    const atts = await db.attachments.bulkGet(ids);
    return atts
      .filter(Boolean)
      .map((a) => a!)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [
    voiceIdsProp?.join(",") ?? "",
    intervention?.voiceNoteIds?.join(",") ?? "",
    note?.voiceNoteIds?.join(",") ?? "",
    liveEpoch
  ]);

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
      <div className="text-sm font-semibold">{t("voice.list.title")}</div>
      {list.length === 0 ? (
        <div className="rounded-xl border bg-muted px-4 py-3 text-sm text-muted-foreground">
          {t("voice.list.empty")}
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
                  if (!confirm(t("voice.list.confirmDelete"))) {
                    return;
                  }
                  try {
                    const supabase = createSupabaseBrowserClient();
                    const {
                      data: { user }
                    } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
                    let res: { ok: boolean; message?: string };
                    if (interventionId) {
                      res = await performVoiceAttachmentCloudSyncDelete({
                        snap: { attachmentId: a.id, interventionId },
                        supabase: supabase ?? null,
                        userId: user?.id ?? null
                      });
                    } else if (noteId) {
                      res = await performStandaloneAttachmentCloudDelete({
                        attachmentId: a.id,
                        supabase: supabase ?? null,
                        userId: user?.id ?? null
                      });
                      if (res.ok) {
                        const n = await db.notes.get(noteId);
                        if (n) {
                          const next = (n.voiceNoteIds ?? []).filter((x) => x !== a.id);
                          await db.notes.update(noteId, {
                            voiceNoteIds: next.length ? next : undefined,
                            updatedAt: new Date().toISOString()
                          });
                        }
                      }
                    } else {
                      res = { ok: false, message: "missing parent" };
                    }
                    if (!res.ok) {
                      toast({
                        title: t("voice.list.toasts.deleteFailedTitle"),
                        description: res.message,
                        variant: "destructive"
                      });
                      return;
                    }
                    toast({
                      title: t("voice.list.toasts.deletedTitle"),
                      description: t("voice.list.toasts.deletedBody")
                    });
                    scheduleWorkflowSync();
                  } catch (e: any) {
                    toast({
                      title: t("voice.list.toasts.deleteFailedTitle"),
                      description: e?.message ?? t("voice.list.toasts.deleteFailedBodyFallback"),
                      variant: "destructive"
                    });
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                {t("common.delete")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

