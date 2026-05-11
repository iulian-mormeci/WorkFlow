"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Pause, Play, Save, Square, Trash2 } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { persistAttachmentToCloud } from "@/lib/sync/attachment-cloud";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";

type Props = {
  interventionId: string;
};

function pickBestMime() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg"
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return "";
}

export function VoiceNoteRecorder({ interventionId }: Props) {
  const t = useTranslations();
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const mimeType = useMemo(() => pickBestMime(), []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(t("voice.recorder.errors.notSupported"));
      }
      if (typeof MediaRecorder === "undefined") {
        throw new Error(t("voice.recorder.errors.mediaRecorderUnavailable"));
      }

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setPreviewBlob(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setPreviewBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      };

      rec.start();
      setRecording(true);
      setPaused(false);
    } catch (e: any) {
      toast({
        title: t("voice.recorder.toasts.cannotRecordTitle"),
        description: e?.message ?? t("voice.recorder.toasts.cannotRecordBodyFallback"),
        variant: "destructive"
      });
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    const rec = recorderRef.current;
    if (!rec) return;
    try {
      rec.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    } finally {
      setRecording(false);
      setPaused(false);
    }
  }

  async function stopAndSave() {
    const rec = recorderRef.current;
    if (!rec) return;
    setBusy(true);
    try {
      // Stop recorder and persist without requiring preview/save steps.
      await new Promise<void>((resolve) => {
        const prevOnStop = rec.onstop;
        rec.onstop = (ev: any) => {
          prevOnStop?.call(rec, ev);
          resolve();
        };
        stop();
      });

      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      const nowIso = new Date().toISOString();
      const id = crypto.randomUUID();

      await db.attachments.add({
        id,
        kind: "audio",
        mime: blob.type || "audio/webm",
        name: `voice-note-${nowIso}`,
        size: blob.size,
        blob,
        createdAt: nowIso
      });

      const intervention = await db.interventions.get(interventionId);
      const prev = intervention?.voiceNoteIds ?? [];
      await db.interventions.update(interventionId, {
        voiceNoteIds: [...prev, id],
        updatedAt: nowIso
      });

      setUploadPct(0);
      try {
        const supabase = createSupabaseBrowserClient();
        if (supabase && navigator.onLine) {
          const {
            data: { user }
          } = await supabase.auth.getUser();
          if (user) {
            const att = await db.attachments.get(id);
            if (att) {
              await persistAttachmentToCloud(supabase, user.id, att, {
                onProgress: (p) => setUploadPct(p)
              });
            }
          }
        }
      } catch (e: unknown) {
        toast({
          title: t("voice.recorder.toasts.cloudUploadIncompleteTitle"),
          description:
            e instanceof Error ? e.message : t("voice.recorder.toasts.cloudUploadIncompleteBodyFallback"),
          variant: "destructive"
        });
      } finally {
        setUploadPct(null);
      }

      scheduleWorkflowSync();
      toast({
        title: t("voice.recorder.toasts.savedTitle"),
        description: t("voice.recorder.toasts.savedBody")
      });

      // Clear any preview state created by onstop
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewBlob(null);
    } finally {
      setBusy(false);
    }
  }

  function togglePause() {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      setPaused(true);
    } else if (rec.state === "paused") {
      rec.resume();
      setPaused(false);
    }
  }

  async function save() {
    if (!previewBlob) return;
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const id = crypto.randomUUID();
      await db.attachments.add({
        id,
        kind: "audio",
        mime: previewBlob.type || "audio/webm",
        name: `voice-note-${nowIso}`,
        size: previewBlob.size,
        blob: previewBlob,
        createdAt: nowIso
      });

      const intervention = await db.interventions.get(interventionId);
      const prev = intervention?.voiceNoteIds ?? [];
      await db.interventions.update(interventionId, {
        voiceNoteIds: [...prev, id],
        updatedAt: nowIso
      });

      setUploadPct(0);
      try {
        const supabase = createSupabaseBrowserClient();
        if (supabase && navigator.onLine) {
          const {
            data: { user }
          } = await supabase.auth.getUser();
          if (user) {
            const att = await db.attachments.get(id);
            if (att) {
              await persistAttachmentToCloud(supabase, user.id, att, {
                onProgress: (p) => setUploadPct(p)
              });
            }
          }
        }
      } catch (e: unknown) {
        toast({
        title: t("voice.recorder.toasts.cloudUploadIncompleteTitle"),
          description:
          e instanceof Error ? e.message : t("voice.recorder.toasts.cloudUploadIncompleteBodyFallback"),
          variant: "destructive"
        });
      } finally {
        setUploadPct(null);
      }

      scheduleWorkflowSync();
    toast({
      title: t("voice.recorder.toasts.savedTitle"),
      description: t("voice.recorder.toasts.savedBody")
    });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewBlob(null);
    } catch (e: any) {
      toast({
        title: t("voice.recorder.toasts.saveFailedTitle"),
        description: e?.message ?? t("voice.recorder.toasts.saveFailedBodyFallback"),
        variant: "destructive"
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-2xl border bg-background p-4">
      {uploadPct != null ? (
        <div className="grid gap-1">
          <div className="text-xs font-medium text-muted-foreground">
            {t("voice.recorder.uploading", { pct: uploadPct })}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${uploadPct}%` }}
            />
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{t("voice.recorder.title")}</div>
          <div className="text-xs text-muted-foreground">{t("voice.recorder.subtitle")}</div>
        </div>

        <div className="flex items-center gap-2">
          {!recording ? (
            <Button disabled={busy} onClick={start} type="button">
              <Mic className="h-4 w-4" />
              {t("voice.recorder.actions.record")}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={togglePause} type="button">
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {paused ? t("voice.recorder.actions.resume") : t("voice.recorder.actions.pause")}
              </Button>
              <Button variant="outline" onClick={stopAndSave} type="button" disabled={busy}>
                <Save className="h-4 w-4" />
                {t("voice.recorder.actions.stopAndSave")}
              </Button>
              <Button onClick={stop} type="button" disabled={busy}>
                <Square className="h-4 w-4" />
                {t("voice.recorder.actions.stop")}
              </Button>
            </>
          )}
        </div>
      </div>

      {previewUrl ? (
        <div className="grid gap-2">
          <audio controls src={previewUrl} className="w-full" />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
                setPreviewBlob(null);
              }}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              {t("voice.recorder.actions.discard")}
            </Button>
            <Button disabled={busy} onClick={save} type="button">
              <Save className="h-4 w-4" />
              {t("common.save")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-muted px-4 py-3 text-sm text-muted-foreground">
          {recording ? t("voice.recorder.state.recording") : t("voice.recorder.state.noNewRecording")}
        </div>
      )}
    </div>
  );
}

