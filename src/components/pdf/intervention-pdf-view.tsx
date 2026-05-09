"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/workflow-db";
import { AttachmentImage } from "@/components/attachments/attachment-image";

export function InterventionPdfView({ id }: { id: string }) {
  const intervention = useLiveQuery(async () => await db.interventions.get(id), [id]);
  const client = useLiveQuery(async () => {
    if (!intervention?.clientId) return null;
    return await db.clients.get(intervention.clientId);
  }, [intervention?.clientId]);
  const spareParts = useLiveQuery(async () => db.spareParts.toArray(), []);

  if (!intervention) return null;

  const partById = new Map(spareParts?.map((p) => [p.id, p]) ?? []);
  const techName =
    (typeof window !== "undefined" && localStorage.getItem("workflow:techName")) ||
    "Technician Name";

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
              <div className="text-[18px] font-semibold">WorkFlow</div>
              <div className="text-[12px] text-gray-600">
                Company Name Placeholder
              </div>
            </div>
          </div>
          <div className="mt-3 text-[12px] text-gray-600">Intervention report</div>
        </div>
        <div className="text-right text-[12px] text-gray-700">
          <div className="font-semibold text-gray-900">
            {new Date(intervention.startAt).toLocaleDateString()}
          </div>
          <div className="mt-1">{new Date(intervention.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          <div className="mt-2 space-y-1 text-right">
            <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-800">
              {(intervention.workCategory ?? "intervention") === "activity" ? "ACTIVITY" : "INTERVENTION"}
            </div>
            <div className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-800">
              {String(intervention.type).toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div>
          <div className="text-[11px] font-semibold text-gray-700">Client</div>
          <div className="mt-1 text-[14px] font-semibold">
            {client?.name ?? "—"}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-gray-700">Summary</div>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] text-gray-900">
            <div>
              <div className="text-[10px] font-semibold text-gray-600">Technician</div>
              <div className="mt-0.5 font-semibold">{techName}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-gray-600">KM</div>
              <div className="mt-0.5 font-semibold">{intervention.km ?? "—"}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-gray-600">Duration</div>
              <div className="mt-0.5 font-semibold">
                {intervention.durationMinutes != null ? `${intervention.durationMinutes} min` : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-gray-600">Status</div>
              <div className="mt-0.5 font-semibold">{intervention.status ?? "—"}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-gray-600">Due</div>
              <div className="mt-0.5 font-semibold">
                {intervention.dueAt ? new Date(intervention.dueAt).toLocaleString() : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-gray-600">Route auto KM</div>
              <div className="mt-0.5 font-semibold">{intervention.locationKmAuto ?? "—"}</div>
            </div>
          </div>
        </div>
      </div>

      {intervention.notes ? (
        <div className="mt-6">
          <div className="text-[11px] font-semibold text-gray-700">Notes</div>
          <div className="mt-1 whitespace-pre-wrap rounded border border-gray-200 p-3 text-gray-900">
            {intervention.notes}
          </div>
        </div>
      ) : null}

      {intervention.checklist?.length ? (
        <div className="mt-6">
          <div className="text-[11px] font-semibold text-gray-700">Checklist</div>
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
          <div className="text-[11px] font-semibold text-gray-700">Spare parts used</div>
          <div className="mt-2 overflow-hidden rounded border border-gray-200">
            <div className="grid grid-cols-[1fr_80px] bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-700">
              <div>Part</div>
              <div className="text-right">Qty</div>
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
          <div className="text-[11px] font-semibold text-gray-700">Photos</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {intervention.photoIds.slice(0, 9).map((pid) => (
              <div key={pid} className="overflow-hidden rounded border border-gray-200">
                <AttachmentImage id={pid} className="h-32 w-full object-cover" alt="Photo" />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Signature intentionally removed for personal workflow */}

      <div className="mt-8 border-t border-gray-200 pt-3 text-[10px] text-gray-500">
        Company Name Placeholder • Address/Phone placeholder • Generated by WorkFlow
      </div>
    </div>
  );
}

