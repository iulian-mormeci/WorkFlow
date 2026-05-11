"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/workflow-db";
import { AttachmentImage } from "@/components/attachments/attachment-image";
import { useTranslations } from "next-intl";

export function InterventionPdfView({ id }: { id: string }) {
  const t = useTranslations();
  const intervention = useLiveQuery(async () => await db.interventions.get(id), [id]);
  const client = useLiveQuery(async () => {
    if (!intervention?.clientId) return null;
    return await db.clients.get(intervention.clientId);
  }, [intervention?.clientId]);
  const spareParts = useLiveQuery(async () => db.spareParts.toArray(), []);

  const [techName, setTechName] = useState("");
  useEffect(() => {
    try {
      const v = localStorage.getItem("workflow:techName");
      if (v) setTechName(v);
    } catch {
      /* ignore */
    }
  }, []);

  if (!intervention) return null;

  const partById = new Map(spareParts?.map((p) => [p.id, p]) ?? []);

  return (
    <div
      id="workflow-pdf-root"
      className="w-[794px] bg-white p-8 text-[12px] text-black"
      style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system" }}
    >
      <div className="flex items-start justify-between border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg border border-gray-200 bg-gray-50" />
            <div>
              <div className="text-[18px] font-semibold">{t("common.appName")}</div>
              <div className="text-[12px] text-gray-600">
                {t("pdf.companyNamePlaceholder")}
              </div>
            </div>
          </div>
          <div className="mt-3 text-[12px] text-gray-600">{t("pdf.interventionReport")}</div>
        </div>
        <div className="text-right text-[12px] text-gray-700" suppressHydrationWarning>
          <div className="font-semibold text-gray-900">
            {intervention.startAt ? new Date(intervention.startAt).toLocaleDateString() : t("common.noDate")}
          </div>
          <div className="mt-1">
            {intervention.startAt
              ? new Date(intervention.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : intervention.dueAt
                ? t("pdf.dueInline", { when: new Date(intervention.dueAt).toLocaleString() })
                : "—"}
          </div>
          <div className="mt-2 space-y-1 text-right">
            <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-800">
              {(intervention.workCategory ?? "intervention") === "activity"
                ? t("pdf.workCategory.activity")
                : t("pdf.workCategory.intervention")}
            </div>
            <div className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-800">
              {String(intervention.type).toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div>
          <div className="text-[11px] font-semibold text-gray-700">{t("common.client")}</div>
          <div className="mt-1 text-[14px] font-semibold">
            {client?.name ?? "—"}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-gray-700">{t("pdf.summary")}</div>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] text-gray-900">
            <div>
              <div className="text-[10px] font-semibold text-gray-600">{t("pdf.technician")}</div>
              <div className="mt-0.5 font-semibold">
                {techName || t("pdf.technicianPlaceholder")}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-gray-600">{t("common.km")}</div>
              <div className="mt-0.5 font-semibold">{intervention.km ?? "—"}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-gray-600">{t("pdf.duration")}</div>
              <div className="mt-0.5 font-semibold">
                {intervention.durationMinutes != null
                  ? t("common.minutesShort", { minutes: intervention.durationMinutes })
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-gray-600">{t("pdf.status")}</div>
              <div className="mt-0.5 font-semibold">{intervention.status ?? "—"}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-gray-600">{t("pdf.due")}</div>
              <div className="mt-0.5 font-semibold" suppressHydrationWarning>
                {intervention.dueAt ? new Date(intervention.dueAt).toLocaleString() : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-gray-600">{t("pdf.routeAutoKm")}</div>
              <div className="mt-0.5 font-semibold">{intervention.locationKmAuto ?? "—"}</div>
            </div>
          </div>
        </div>
      </div>

      {intervention.notes ? (
        <div className="mt-6">
          <div className="text-[11px] font-semibold text-gray-700">{t("pdf.notes")}</div>
          <div className="mt-1 whitespace-pre-wrap rounded border border-gray-200 p-3 text-gray-900">
            {intervention.notes}
          </div>
        </div>
      ) : null}

      {intervention.checklist?.length ? (
        <div className="mt-6">
          <div className="text-[11px] font-semibold text-gray-700">{t("pdf.checklist")}</div>
          <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
            {intervention.checklist.map((c) => (
              <li key={c.id} className="text-gray-900">
                {c.done ? "☑" : "☐"} {c.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {intervention.sparePartsUsed?.length ? (
        <div className="mt-6">
          <div className="text-[11px] font-semibold text-gray-700">{t("pdf.sparePartsUsed")}</div>
          <div className="mt-2 overflow-hidden rounded border border-gray-200">
            <div className="grid grid-cols-[1fr_80px] bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-700">
              <div>{t("pdf.part")}</div>
              <div className="text-right">{t("pdf.qty")}</div>
            </div>
            {intervention.sparePartsUsed.map((l, idx) => {
              const p = partById.get(l.sparePartId);
              return (
                <div
                  key={`${l.sparePartId}-${idx}`}
                  className="grid grid-cols-[1fr_80px] px-3 py-2 text-gray-900"
                >
                  <div>{p ? `${p.name} (${p.sku})` : l.sparePartId}</div>
                  <div className="text-right">{l.qty}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {intervention.photoIds?.length ? (
        <div className="mt-6">
          <div className="text-[11px] font-semibold text-gray-700">{t("pdf.photos")}</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {intervention.photoIds.slice(0, 9).map((pid) => (
              <div key={pid} className="overflow-hidden rounded border border-gray-200">
                <AttachmentImage id={pid} className="h-32 w-full object-cover" alt={t("pdf.photoAlt")} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Signature intentionally removed for personal workflow */}

      <div className="mt-8 border-t border-gray-200 pt-3 text-[10px] text-gray-500">
        {t("pdf.footerPlaceholder")}
      </div>
    </div>
  );
}

