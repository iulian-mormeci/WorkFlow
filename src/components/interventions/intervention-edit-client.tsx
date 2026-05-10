"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CheckCircle2,
  ChevronLeft,
  FileDown,
  FileImage,
  FileScan,
  Layers,
  Mail,
  MapPin,
  MessageSquarePlus,
  Mic,
  NotebookPen,
  Pencil,
  Scan,
  Trash2
} from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InterventionFormDialog } from "@/components/interventions/intervention-form-dialog";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { AttachmentImage } from "@/components/attachments/attachment-image";
import { DocumentScannerDialog } from "@/components/documents/document-scanner-dialog";
import { SendToSupportDialog } from "@/components/support/send-to-support-dialog";
import { InterventionPdfView } from "@/components/pdf/intervention-pdf-view";
import { exportInterventionPdf } from "@/lib/pdf/export-intervention-pdf";
import { exportInterventionForCrm } from "@/lib/export/crm-export";
import { VoiceNoteRecorder } from "@/components/voice/voice-note-recorder";
import { VoiceNotesList } from "@/components/voice/voice-notes-list";
import { QuickNoteFab } from "@/components/notes/quick-note-fab";
import { DueCountdown } from "@/components/interventions/due-countdown";
import { InterventionStatusBadge } from "@/components/interventions/intervention-status-badge";
import { InterventionTimerPanel } from "@/components/interventions/intervention-timer-panel";
import { OpenRouteInNavigatorButton } from "@/components/interventions/open-route-in-navigator-button";
import { RouteStopsEditor } from "@/components/interventions/route-stops-editor";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBubble } from "@/components/ui/icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { performInterventionCloudSyncDelete } from "@/lib/sync/cloud-delete";
import { scheduleWorkflowSync } from "@/lib/sync/sync-engine";
import { InterventionRouteMapPreview } from "@/components/interventions/intervention-route-map-preview";
import {
  coerceInterventionWorkflowStatus,
  formatElapsedHms,
  getTimerElapsedSeconds,
  isInterventionCompleted,
  normalizeTimerRunState
} from "@/lib/interventions/intervention-helpers";
import {
  interventionEndpointsToMapStops,
  routeStopDraftsToMapStops
} from "@/lib/navigation/multi-stop-maps";
import {
  listRouteStops,
  subscribeRouteStops,
  type RouteStopDraft
} from "@/lib/routes/route-stops";
import type { Intervention } from "@/lib/db/workflow-db";

function OpenInterventionRouteNavigator({
  interventionId,
  intervention
}: {
  interventionId: string;
  intervention: Intervention;
}) {
  const [cloudStops, setCloudStops] = useState<RouteStopDraft[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const list = await listRouteStops(interventionId);
      if (!cancelled) setCloudStops(list);
    }
    void load();
    const unsub = subscribeRouteStops(interventionId, () => {
      void load();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [interventionId]);

  const mapStops = useMemo(() => {
    if (cloudStops.length >= 2) return routeStopDraftsToMapStops(cloudStops);
    return interventionEndpointsToMapStops(intervention);
  }, [cloudStops, intervention]);

  if (mapStops.length < 2) return null;

  return (
    <div className="border-b border-primary/15 bg-gradient-to-b from-primary/5 to-transparent px-5 py-5 md:px-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Navigazione</p>
      <OpenRouteInNavigatorButton stops={mapStops} />
      <p className="mt-2 text-xs text-muted-foreground">
        Su iPad si apre Mappe con tutte le fermate; su altri dispositivi si usa Google Maps se Mappe non conviene.
      </p>
    </div>
  );
}

export function InterventionEditClient({ id }: { id: string }) {
  const liveEpoch = useWorkflowLiveEpoch();
  const intervention = useLiveQuery(async () => await db.interventions.get(id), [id, liveEpoch]);
  const client = useLiveQuery(async () => {
    if (!intervention?.clientId) return null;
    return await db.clients.get(intervention.clientId);
  }, [intervention?.clientId, liveEpoch]);

  const [open, setOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [sendDocId, setSendDocId] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [markingComplete, setMarkingComplete] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const [, setClock] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setClock((c) => c + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  if (intervention === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-40 animate-pulse rounded-xl bg-muted" />
        <div className="rounded-2xl border p-4">
          <div className="h-5 w-64 animate-pulse rounded-xl bg-muted" />
          <div className="mt-3 h-4 w-40 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  if (intervention === null) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link className="inline-flex items-center gap-2 text-sm underline" href="/interventions">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
        </div>
        <div className="rounded-2xl border bg-muted p-4 text-sm text-muted-foreground">
          Intervention not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Link className="inline-flex items-center gap-2 text-sm underline" href="/interventions">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Link>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {client?.name ?? "Intervention"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(intervention.startAt).toLocaleString()}
            {intervention.dueAt ? (
              <>
                {" "}
                · Must complete by {new Date(intervention.dueAt).toLocaleString()} (
                <DueCountdown intervention={intervention} />)
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InterventionStatusBadge intervention={intervention} />
          <Button type="button" variant="outline" onClick={() => setPdfOpen(true)}>
            <FileDown className="h-4 w-4" />
            PDF
          </Button>
          <Button type="button" variant="outline" onClick={() => setTicketOpen(true)}>
            <MessageSquarePlus className="h-4 w-4" />
            Ticket
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                await exportInterventionForCrm(id);
                toast({ title: "Exported for CRM", description: "JSON + CSV downloaded." });
              } catch (e: any) {
                toast({
                  title: "CRM export failed",
                  description: e?.message ?? "Could not export",
                  variant: "destructive"
                });
              }
            }}
          >
            Export for CRM
          </Button>
          <Button type="button" onClick={() => setOpen(true)} variant="outline">
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          {!isInterventionCompleted(intervention) ? (
            <Button
              type="button"
              variant="secondary"
              disabled={markingComplete}
              onClick={async () => {
                setMarkingComplete(true);
                try {
                  const nowIso = new Date().toISOString();
                  const acc = getTimerElapsedSeconds(intervention);
                  await db.interventions.update(intervention.id, {
                    status: "completed",
                    endAt: nowIso,
                    timerRunState: "idle",
                    timerStartedAt: undefined,
                    timerAccumulatedSeconds: acc,
                    ...(acc > 0 ? { durationMinutes: Math.max(1, Math.round(acc / 60)) } : {}),
                    updatedAt: nowIso
                  });
                  scheduleWorkflowSync();
                  toast({
                    title: "Marked complete",
                    description:
                      acc > 0
                        ? "Visit closed and duration saved from the timer."
                        : "Visit closed."
                  });
                } catch (e: unknown) {
                  toast({
                    title: "Could not update",
                    description: e instanceof Error ? e.message : "Unknown error",
                    variant: "destructive"
                  });
                } finally {
                  setMarkingComplete(false);
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              Mark complete
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => {
              setTemplateName(
                `${client?.name ?? "Client"} • ${intervention.type}`
              );
              setTemplateOpen(true);
            }}
            variant="outline"
          >
            <Layers className="h-4 w-4" />
            Save template
          </Button>
          <Button type="button" onClick={() => setConfirmDelete(true)} variant="outline">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </header>

      <OfflineBanner />

      <div className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2">
        <div>
          <div className="text-xs text-muted-foreground">Work</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge
              className={
                (intervention.workCategory ?? "intervention") === "activity"
                  ? "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-200"
                  : "border-primary/30 bg-primary/10 text-primary"
              }
            >
              {(intervention.workCategory ?? "intervention") === "activity" ? "Activity" : "Intervention"}
            </Badge>
            {(intervention.workCategory ?? "intervention") === "activity" &&
            intervention.isOfficeActivity ? (
              <span className="text-xs text-muted-foreground">On-site office</span>
            ) : (intervention.workCategory ?? "intervention") === "activity" ? (
              <span className="text-xs text-muted-foreground">Remote</span>
            ) : null}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Job type</div>
          <div className="font-semibold">{intervention.type}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Duration</div>
          <div className="font-semibold">
            {coerceInterventionWorkflowStatus(intervention.status) === "in_progress" ||
            normalizeTimerRunState(intervention) === "running" ||
            normalizeTimerRunState(intervention) === "paused" ? (
              <span className="font-mono">
                Timer {normalizeTimerRunState(intervention)} ·{" "}
                {formatElapsedHms(getTimerElapsedSeconds(intervention))}
              </span>
            ) : intervention.durationMinutes != null ? (
              `${intervention.durationMinutes} min`
            ) : (
              "—"
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">KM</div>
          <div className="font-semibold">{intervention.km ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Spare parts</div>
          <div className="font-semibold">
            {intervention.sparePartsUsed?.length ?? 0}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {!isInterventionCompleted(intervention) ? (
          <InterventionTimerPanel interventionId={intervention.id} />
        ) : (
          <div className="rounded-2xl border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
            This visit is completed. Use Edit to adjust details; the timer is closed.
          </div>
        )}
        {intervention.startLocation || intervention.endLocation ? (
          <Card className="rounded-2xl">
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Route</CardTitle>
                  <CardDescription>Start / end stops and auto distance.</CardDescription>
                </div>
                <IconBubble icon={MapPin} />
              </div>
              <div className="mt-2 space-y-2 text-sm">
                {intervention.startLocation ? (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Start</div>
                    <div>{intervention.startLocation.address}</div>
                  </div>
                ) : null}
                {intervention.endLocation ? (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">End</div>
                    <div>{intervention.endLocation.address}</div>
                  </div>
                ) : null}
                {intervention.locationKmAuto != null ? (
                  <div className="text-xs text-muted-foreground">
                    Auto route ≈ {intervention.locationKmAuto} km · Manual KM: {intervention.km ?? "—"}
                  </div>
                ) : null}
              </div>
              <div className="mt-4">
                <InterventionRouteMapPreview
                  start={intervention.startLocation}
                  end={intervention.endLocation}
                  variant="compact"
                />
              </div>
            </CardHeader>
          </Card>
        ) : (
          <div className="hidden lg:block" aria-hidden />
        )}
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Advanced route (multi-stop)</CardTitle>
              <CardDescription>Realtime stops list shared across devices.</CardDescription>
            </div>
            <IconBubble icon={MapPin} />
          </div>
        </CardHeader>
        <OpenInterventionRouteNavigator interventionId={intervention.id} intervention={intervention} />
        <div className="px-5 pb-5 md:px-6 md:pb-6">
          <RouteStopsEditor interventionId={intervention.id} />
        </div>
      </Card>

      {intervention.notes ? (
        <Card className="rounded-2xl">
          <CardHeader className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Notes</CardTitle>
                <CardDescription>What was done, observations, follow-ups.</CardDescription>
              </div>
              <IconBubble icon={NotebookPen} />
            </div>
            <div className="mt-2 whitespace-pre-wrap text-sm">{intervention.notes}</div>
          </CardHeader>
        </Card>
      ) : null}

      <Card className="rounded-2xl">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Voice notes</CardTitle>
              <CardDescription>Fast audio memos stored locally.</CardDescription>
            </div>
            <IconBubble icon={Mic} />
          </div>
        </CardHeader>
        <div className="px-5 pb-5 md:px-6 md:pb-6">
          <div className="grid gap-3">
            <VoiceNoteRecorder interventionId={id} />
            <VoiceNotesList interventionId={id} />
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Photos</CardTitle>
              <CardDescription>Tap a photo to enlarge.</CardDescription>
            </div>
            <IconBubble icon={FileImage} />
          </div>
        </CardHeader>
        <div className="px-5 pb-5 md:px-6 md:pb-6">
          {(intervention.photoIds ?? []).length === 0 ? (
            <div className="rounded-xl border bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
              No photos attached.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(intervention.photoIds ?? []).map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() => setPhotoOpen(pid)}
                  className="group relative overflow-hidden rounded-2xl border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <AttachmentImage
                    id={pid}
                    className="h-32 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    alt="Photo"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="rounded-2xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileScan className="h-4 w-4 text-muted-foreground" />
              Documents
            </div>
            <div className="text-xs text-muted-foreground">
              Scan paperwork into a single PDF per intervention.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setScanOpen(true)}>
              <Scan className="h-4 w-4" />
              Scan document
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {(intervention.documentIds ?? []).length === 0 ? (
            <div className="rounded-xl border bg-muted px-4 py-6 text-sm text-muted-foreground">
              No scanned documents yet.
            </div>
          ) : (
            (intervention.documentIds ?? []).map((docId) => (
              <DocumentRow key={docId} docId={docId} onSend={(id) => setSendDocId(id)} />
            ))
          )}
        </div>
      </div>

      {/* Signature intentionally removed for personal workflow */}

      <InterventionFormDialog
        open={open}
        onOpenChange={setOpen}
        mode="edit"
        interventionId={id}
      />

      <Dialog open={Boolean(photoOpen)} onOpenChange={() => setPhotoOpen(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Photo</DialogTitle>
            <DialogDescription>Tap outside to close.</DialogDescription>
          </DialogHeader>
          {photoOpen ? (
            <div className="mt-3 overflow-hidden rounded-2xl border bg-black">
              <AttachmentImage
                id={photoOpen}
                className="max-h-[70dvh] w-full object-contain"
                alt="Photo preview"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <DocumentScannerDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        interventionId={id}
        defaultTitle={`${client?.name ?? "Client"} - ${new Date(intervention.startAt).toLocaleDateString()}`}
      />

      <SendToSupportDialog
        open={Boolean(sendDocId)}
        onOpenChange={(v) => !v && setSendDocId(null)}
        documentId={sendDocId ?? ""}
        interventionRef={`${client?.name ?? "Client"} • ${new Date(intervention.startAt).toLocaleDateString()}`}
      />

      <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
        <DialogContent className="max-w-[900px]">
          <DialogHeader>
            <DialogTitle>PDF export</DialogTitle>
            <DialogDescription>
              Preview is generated locally from your offline data.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 max-h-[60dvh] overflow-auto rounded-2xl border bg-muted p-3">
            <InterventionPdfView id={id} />
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setPdfOpen(false)} type="button">
              Close
            </Button>
            <Button
              onClick={async () => {
                try {
                  const safe = (client?.name ?? "intervention").replaceAll(/[^\w\-]+/g, "-");
                  await exportInterventionPdf({
                    filename: `workflow-${safe}-${id.slice(0, 8)}.pdf`
                  });
                  toast({ title: "PDF ready", description: "Downloaded to your device." });
                } catch (e: any) {
                  toast({
                    title: "PDF export failed",
                    description: e?.message ?? "Could not generate PDF",
                    variant: "destructive"
                  });
                }
              }}
              type="button"
            >
              Download PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create ticket from intervention</DialogTitle>
            <DialogDescription>
              Creates a CRM ticket linked to this intervention (offline-first).
            </DialogDescription>
          </DialogHeader>

          <CreateTicketFromIntervention
            interventionId={id}
            clientName={client?.name ?? ""}
            onDone={() => setTicketOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Creates a reusable template from this intervention (no documents/photos).
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-2">
              <Label>Template name</Label>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template name" />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setTemplateOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={templateName.trim().length < 3}
                onClick={async () => {
                  try {
                    const nowIso = new Date().toISOString();
                    await db.templates.add({
                      id: crypto.randomUUID(),
                      name: templateName.trim(),
                      clientName: undefined,
                      defaultClientId: intervention.clientId,
                      type: intervention.type,
                      workCategory: intervention.workCategory ?? "intervention",
                      isOfficeActivity: intervention.isOfficeActivity,
                      defaultDurationMinutes: intervention.durationMinutes,
                      km: intervention.km ?? undefined,
                      notes: intervention.notes ?? undefined,
                      checklist: intervention.checklist ?? undefined,
                      sparePartsUsed: intervention.sparePartsUsed ?? undefined,
                      createdAt: nowIso,
                      updatedAt: nowIso
                    });
                    toast({ title: "Template saved", description: "Available in Templates." });
                    setTemplateOpen(false);
                  } catch (e: any) {
                    toast({
                      title: "Failed to save template",
                      description: e?.message ?? "Unknown error",
                      variant: "destructive"
                    });
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={(open) => !deleting && setConfirmDelete(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete intervention?</DialogTitle>
            <DialogDescription>
              When you are online, this also removes the intervention from your Supabase account
              (documents, attachments, and queued emails in the cloud). CRM tickets stay but are
              unlinked. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(false)}
              type="button"
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
              disabled={deleting}
              type="button"
              onClick={async () => {
                setDeleting(true);
                try {
                  const supabase = createSupabaseBrowserClient();
                  const session =
                    (await supabase?.auth.getSession())?.data.session ?? null;
                  const res = await performInterventionCloudSyncDelete({
                    interventionId: intervention.id,
                    supabase: supabase ?? null,
                    userId: session?.user?.id ?? null
                  });
                  if (!res.ok) {
                    toast({
                      title: "Could not delete in the cloud",
                      description: res.message,
                      variant: "destructive"
                    });
                    return;
                  }
                  setConfirmDelete(false);
                  toast({
                    title: "Intervention deleted",
                    description:
                      res.mode === "queued"
                        ? "Deleted locally. Will be removed from the cloud when you are online."
                        : "Deleted from all devices."
                  });
                  scheduleWorkflowSync();
                  router.push("/interventions");
                  router.refresh();
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : String(e);
                  toast({
                    title: "Could not delete",
                    description: msg,
                    variant: "destructive"
                  });
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <QuickNoteFab interventionId={id} />
    </div>
  );
}

function DocumentRow({ docId, onSend }: { docId: string; onSend: (id: string) => void }) {
  const { toast } = useToast();
  const liveEpoch = useWorkflowLiveEpoch();
  const doc = useLiveQuery(async () => await db.documents.get(docId), [docId, liveEpoch]);

  if (!doc) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{doc.title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {new Date(doc.createdAt).toLocaleString()} • {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const a = await db.attachments.get(doc.attachmentId);
              if (!a) throw new Error("PDF not found");
              const url = URL.createObjectURL(a.blob);
              window.open(url, "_blank", "noopener,noreferrer");
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
            } catch (e: any) {
              toast({ title: "Open failed", description: e?.message ?? "Could not open", variant: "destructive" });
            }
          }}
        >
          Open PDF
        </Button>
        <Button
          variant="outline"
          onClick={() => onSend(doc.id)}
        >
          <Mail className="h-4 w-4" />
          Send to Support
        </Button>
      </div>
    </div>
  );
}

function CreateTicketFromIntervention({
  interventionId,
  clientName,
  onDone
}: {
  interventionId: string;
  clientName: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(clientName ? `Follow-up: ${clientName}` : "Follow-up");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  const canSave = title.trim().length > 2;

  return (
    <div className="mt-4 grid gap-3">
      <div className="grid gap-2">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Priority</Label>
          <div className="grid grid-cols-3 gap-2">
            {(["low", "medium", "high"] as const).map((p) => (
              <Button
                key={p}
                variant={priority === p ? "default" : "outline"}
                onClick={() => setPriority(p)}
                type="button"
              >
                {p}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Due date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onDone} type="button">
          Cancel
        </Button>
        <Button
          disabled={!canSave}
          onClick={async () => {
            try {
              const nowIso = new Date().toISOString();
              const dueAt = dueDate ? new Date(dueDate).toISOString() : undefined;
              await db.tickets.add({
                id: crypto.randomUUID(),
                title: title.trim(),
                description: description.trim() || undefined,
                priority,
                status: "open",
                dueAt,
                reminderAt: dueAt,
                interventionId,
                createdAt: nowIso,
                updatedAt: nowIso
              });
              toast({ title: "Ticket created", description: "Linked to intervention." });
              onDone();
            } catch (e: any) {
              toast({
                title: "Failed to create ticket",
                description: e?.message ?? "Unknown error",
                variant: "destructive"
              });
            }
          }}
          type="button"
        >
          Create ticket
        </Button>
      </div>
    </div>
  );
}

