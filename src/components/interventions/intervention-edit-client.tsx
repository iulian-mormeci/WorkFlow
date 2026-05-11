"use client";

import { Link, useRouter } from "@/i18n/navigation";
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
import { useTranslations } from "next-intl";

function OpenInterventionRouteNavigator({
  interventionId,
  intervention
}: {
  interventionId: string;
  intervention: Intervention;
}) {
  const t = useTranslations();
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
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("interventions.detail.route.navigatorTitle")}
      </p>
      <OpenRouteInNavigatorButton stops={mapStops} />
      <p className="mt-2 text-xs text-muted-foreground">
        {t("interventions.detail.route.navigatorHint")}
      </p>
    </div>
  );
}

export function InterventionEditClient({ id }: { id: string }) {
  const t = useTranslations();
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
            {t("common.back")}
          </Link>
        </div>
        <div className="rounded-2xl border bg-muted p-4 text-sm text-muted-foreground">
          {t("interventions.detail.notFound")}
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
              {t("common.back")}
            </Link>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {client?.name ?? t("common.intervention")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {intervention.startAt ? (
              <span suppressHydrationWarning>{new Date(intervention.startAt).toLocaleString()}</span>
            ) : (
              <span>{t("common.noDate")}</span>
            )}
            {intervention.dueAt ? (
              <>
                {" "}
                · {t("interventions.detail.mustCompleteByPrefix")}{" "}
                <span suppressHydrationWarning>{new Date(intervention.dueAt).toLocaleString()}</span> (
                <DueCountdown intervention={intervention} />)
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InterventionStatusBadge intervention={intervention} />
          <Button type="button" variant="outline" onClick={() => setPdfOpen(true)}>
            <FileDown className="h-4 w-4" />
            {t("common.pdf")}
          </Button>
          <Button type="button" variant="outline" onClick={() => setTicketOpen(true)}>
            <MessageSquarePlus className="h-4 w-4" />
            {t("common.ticket")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                await exportInterventionForCrm(id);
                toast({
                  title: t("interventions.detail.toasts.crmExportedTitle"),
                  description: t("interventions.detail.toasts.crmExportedBody")
                });
              } catch (e: any) {
                toast({
                  title: t("interventions.detail.toasts.crmExportFailedTitle"),
                  description: e?.message ?? t("interventions.detail.toasts.crmExportFailedBody"),
                  variant: "destructive"
                });
              }
            }}
          >
            {t("interventions.detail.actions.exportForCrm")}
          </Button>
          <Button type="button" onClick={() => setOpen(true)} variant="outline">
            <Pencil className="h-4 w-4" />
            {t("common.edit")}
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
                    title: t("interventions.detail.toasts.markedCompleteTitle"),
                    description:
                      acc > 0
                        ? t("interventions.detail.toasts.markedCompleteBodyWithTimer")
                        : t("interventions.detail.toasts.markedCompleteBody")
                  });
                } catch (e: unknown) {
                  toast({
                    title: t("common.updateFailed"),
                    description: e instanceof Error ? e.message : t("common.unknownError"),
                    variant: "destructive"
                  });
                } finally {
                  setMarkingComplete(false);
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              {t("interventions.detail.actions.markComplete")}
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => {
              setTemplateName(
                `${client?.name ?? t("common.client")} • ${intervention.type}`
              );
              setTemplateOpen(true);
            }}
            variant="outline"
          >
            <Layers className="h-4 w-4" />
            {t("interventions.detail.actions.saveTemplate")}
          </Button>
          <Button type="button" onClick={() => setConfirmDelete(true)} variant="outline">
            <Trash2 className="h-4 w-4" />
            {t("common.delete")}
          </Button>
        </div>
      </header>

      <OfflineBanner />

      {/* Timer is optional: only show when the visit has a start time. */}
      {intervention.startAt ? <InterventionTimerPanel interventionId={id} /> : null}

      <div className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2">
        <div>
          <div className="text-xs text-muted-foreground">{t("interventions.detail.summary.work")}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge
              className={
                (intervention.workCategory ?? "intervention") === "activity"
                  ? "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-200"
                  : "border-primary/30 bg-primary/10 text-primary"
              }
            >
              {(intervention.workCategory ?? "intervention") === "activity"
                ? t("common.activity")
                : t("common.intervention")}
            </Badge>
            {(intervention.workCategory ?? "intervention") === "activity" &&
            intervention.isOfficeActivity ? (
              <span className="text-xs text-muted-foreground">{t("interventions.detail.summary.onSiteOffice")}</span>
            ) : (intervention.workCategory ?? "intervention") === "activity" ? (
              <span className="text-xs text-muted-foreground">{t("interventions.detail.summary.remote")}</span>
            ) : null}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{t("interventions.detail.summary.jobType")}</div>
          <div className="font-semibold">{intervention.type}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{t("interventions.detail.summary.duration")}</div>
          <div className="font-semibold">
            {coerceInterventionWorkflowStatus(intervention.status) === "in_progress" ||
            normalizeTimerRunState(intervention) === "running" ||
            normalizeTimerRunState(intervention) === "paused" ? (
              <span className="font-mono">
                {t("interventions.detail.summary.timerPrefix", { state: normalizeTimerRunState(intervention) })} ·{" "}
                {formatElapsedHms(getTimerElapsedSeconds(intervention))}
              </span>
            ) : intervention.durationMinutes != null ? (
              t("common.minutesShort", { minutes: intervention.durationMinutes })
            ) : (
              "—"
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{t("interventions.detail.summary.km")}</div>
          <div className="font-semibold">{intervention.km ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{t("interventions.detail.summary.spareParts")}</div>
          <div className="font-semibold">
            {intervention.sparePartsUsed?.length ?? 0}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {!isInterventionCompleted(intervention) && intervention.startAt ? (
          <InterventionTimerPanel interventionId={intervention.id} />
        ) : (
          <div className="rounded-2xl border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
            {isInterventionCompleted(intervention)
              ? t("interventions.detail.timerClosed.completed")
              : t("interventions.detail.timerClosed.noStart")}
          </div>
        )}
        {intervention.startLocation || intervention.endLocation ? (
          <Card className="rounded-2xl">
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{t("interventions.detail.routeCard.title")}</CardTitle>
                  <CardDescription>{t("interventions.detail.routeCard.subtitle")}</CardDescription>
                </div>
                <IconBubble icon={MapPin} />
              </div>
              <div className="mt-2 space-y-2 text-sm">
                {intervention.startLocation ? (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">{t("interventions.detail.routeCard.start")}</div>
                    <div>{intervention.startLocation.address}</div>
                  </div>
                ) : null}
                {intervention.endLocation ? (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">{t("interventions.detail.routeCard.end")}</div>
                    <div>{intervention.endLocation.address}</div>
                  </div>
                ) : null}
                {intervention.locationKmAuto != null ? (
                  <div className="text-xs text-muted-foreground">
                    {t("interventions.detail.routeCard.kmLine", {
                      autoKm: intervention.locationKmAuto,
                      manualKm: intervention.km ?? "—"
                    })}
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
              <CardTitle className="text-base">{t("interventions.detail.advancedRoute.title")}</CardTitle>
              <CardDescription>{t("interventions.detail.advancedRoute.subtitle")}</CardDescription>
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
                <CardTitle className="text-base">{t("interventions.detail.sections.notesTitle")}</CardTitle>
                <CardDescription>{t("interventions.detail.sections.notesSubtitle")}</CardDescription>
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
              <CardTitle className="text-base">{t("voice.sectionTitle")}</CardTitle>
              <CardDescription>{t("voice.sectionSubtitle")}</CardDescription>
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
              <CardTitle className="text-base">{t("interventions.detail.sections.photosTitle")}</CardTitle>
              <CardDescription>{t("interventions.detail.sections.photosSubtitle")}</CardDescription>
            </div>
            <IconBubble icon={FileImage} />
          </div>
        </CardHeader>
        <div className="px-5 pb-5 md:px-6 md:pb-6">
          {(intervention.photoIds ?? []).length === 0 ? (
            <div className="rounded-xl border bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
              {t("interventions.detail.sections.photosEmpty")}
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
                    alt={t("interventions.detail.sections.photosAlt")}
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
              {t("interventions.detail.documentsCard.title")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("interventions.detail.documentsCard.subtitle")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setScanOpen(true)}>
              <Scan className="h-4 w-4" />
              {t("interventions.detail.documentsCard.scanCta")}
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {(intervention.documentIds ?? []).length === 0 ? (
            <div className="rounded-xl border bg-muted px-4 py-6 text-sm text-muted-foreground">
              {t("interventions.detail.documents.empty")}
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
            <DialogTitle>{t("interventions.detail.photoDialog.title")}</DialogTitle>
            <DialogDescription>{t("interventions.detail.photoDialog.subtitle")}</DialogDescription>
          </DialogHeader>
          {photoOpen ? (
            <div className="mt-3 overflow-hidden rounded-2xl border bg-black">
              <AttachmentImage
                id={photoOpen}
                className="max-h-[70dvh] w-full object-contain"
                alt={t("interventions.detail.photoDialog.previewAlt")}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <DocumentScannerDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        interventionId={id}
        defaultTitle={t("interventions.detail.scan.defaultTitle", {
          clientName: client?.name ?? t("common.client"),
          date: intervention.startAt
            ? new Date(intervention.startAt).toLocaleDateString()
            : intervention.dueAt
              ? new Date(intervention.dueAt).toLocaleDateString()
              : t("common.noDate")
        })}
      />

      <SendToSupportDialog
        open={Boolean(sendDocId)}
        onOpenChange={(v) => !v && setSendDocId(null)}
        documentId={sendDocId ?? ""}
        interventionRef={t("interventions.detail.supportRef", {
          clientName: client?.name ?? t("common.client"),
          date: intervention.startAt
            ? new Date(intervention.startAt).toLocaleDateString()
            : intervention.dueAt
              ? new Date(intervention.dueAt).toLocaleDateString()
              : t("common.noDate")
        })}
      />

      <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
        <DialogContent className="max-w-[900px]">
          <DialogHeader>
            <DialogTitle>{t("interventions.detail.pdfDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("interventions.detail.pdfDialog.subtitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 max-h-[60dvh] overflow-auto rounded-2xl border bg-muted p-3">
            <InterventionPdfView id={id} />
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setPdfOpen(false)} type="button">
              {t("common.close")}
            </Button>
            <Button
              onClick={async () => {
                try {
                  const safe = (client?.name ?? t("common.intervention")).replaceAll(/[^\w\-]+/g, "-");
                  await exportInterventionPdf({
                    filename: `workflow-${safe}-${id.slice(0, 8)}.pdf`
                  });
                  toast({
                    title: t("interventions.detail.toasts.pdfReadyTitle"),
                    description: t("interventions.detail.toasts.pdfReadyBody")
                  });
                } catch (e: any) {
                  toast({
                    title: t("interventions.detail.toasts.pdfFailedTitle"),
                    description: e?.message ?? t("interventions.detail.toasts.pdfFailedBody"),
                    variant: "destructive"
                  });
                }
              }}
              type="button"
            >
              {t("interventions.detail.pdfDialog.download")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("interventions.detail.ticketDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("interventions.detail.ticketDialog.subtitle")}
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
            <DialogTitle>{t("interventions.detail.templateDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("interventions.detail.templateDialog.subtitle")}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-2">
              <Label>{t("interventions.detail.templateDialog.nameLabel")}</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t("interventions.detail.templateDialog.namePlaceholder")}
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setTemplateOpen(false)}>
                {t("common.cancel")}
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
                    toast({
                      title: t("interventions.detail.toasts.templateSavedTitle"),
                      description: t("interventions.detail.toasts.templateSavedBody")
                    });
                    setTemplateOpen(false);
                  } catch (e: any) {
                    toast({
                      title: t("interventions.detail.toasts.templateSaveFailedTitle"),
                      description: e?.message ?? t("common.unknownError"),
                      variant: "destructive"
                    });
                  }
                }}
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={(open) => !deleting && setConfirmDelete(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("interventions.deleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("interventions.detail.deleteDialogBody")}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(false)}
              type="button"
              disabled={deleting}
            >
              {t("common.cancel")}
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
                      title: t("interventions.toasts.deleteCloudFailedTitle"),
                      description: res.message,
                      variant: "destructive"
                    });
                    return;
                  }
                  setConfirmDelete(false);
                  toast({
                    title: t("interventions.toasts.deletedTitle"),
                    description:
                      res.mode === "queued"
                        ? t("interventions.toasts.deletedQueuedBody")
                        : t("interventions.toasts.deletedNowBody")
                  });
                  scheduleWorkflowSync();
                  router.push("/interventions");
                  router.refresh();
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : String(e);
                  toast({
                    title: t("interventions.toasts.deleteFailedTitle"),
                    description: msg,
                    variant: "destructive"
                  });
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? t("common.deleting") : t("common.delete")}
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
  const t = useTranslations();
  const liveEpoch = useWorkflowLiveEpoch();
  const doc = useLiveQuery(async () => await db.documents.get(docId), [docId, liveEpoch]);

  if (!doc) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{doc.title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {t("documents.row.meta", {
            createdAt: new Date(doc.createdAt).toLocaleString(),
            pages: doc.pageCount
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const a = await db.attachments.get(doc.attachmentId);
              if (!a) throw new Error(t("documents.errors.pdfNotFound"));
              const url = URL.createObjectURL(a.blob);
              window.open(url, "_blank", "noopener,noreferrer");
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
            } catch (e: any) {
              toast({
                title: t("documents.toasts.openFailedTitle"),
                description: e?.message ?? t("documents.toasts.openFailedBody"),
                variant: "destructive"
              });
            }
          }}
        >
          {t("documents.actions.openPdf")}
        </Button>
        <Button
          variant="outline"
          onClick={() => onSend(doc.id)}
        >
          <Mail className="h-4 w-4" />
          {t("documents.actions.sendToSupport")}
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
  const t = useTranslations();
  const [title, setTitle] = useState(
    clientName ? t("tickets.createFromIntervention.defaultTitleWithClient", { clientName }) : t("tickets.createFromIntervention.defaultTitle")
  );
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
        <Label>{t("tickets.fields.title")}</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>{t("tickets.fields.description")}</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>{t("tickets.fields.priority")}</Label>
          <div className="grid grid-cols-3 gap-2">
            {(["low", "medium", "high"] as const).map((p) => (
              <Button
                key={p}
                variant={priority === p ? "default" : "outline"}
                onClick={() => setPriority(p)}
                type="button"
              >
                {t(`tickets.priority.${p}`)}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <Label>{t("tickets.fields.dueDate")}</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onDone} type="button">
          {t("common.cancel")}
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
              toast({
                title: t("tickets.toasts.createdTitle"),
                description: t("tickets.toasts.createdBody")
              });
              onDone();
            } catch (e: any) {
              toast({
                title: t("tickets.toasts.createFailedTitle"),
                description: e?.message ?? t("common.unknownError"),
                variant: "destructive"
              });
            }
          }}
          type="button"
        >
          {t("tickets.actions.create")}
        </Button>
      </div>
    </div>
  );
}

