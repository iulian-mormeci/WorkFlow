"use client";

import { db } from "@/lib/db/workflow-db";
import { startOfMonth, endOfMonth } from "@/lib/dates";

function download(filename: string, content: Blob) {
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (/[,"\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export async function exportInterventionForCrm(interventionId: string) {
  const intervention = await db.interventions.get(interventionId);
  if (!intervention) throw new Error("Intervention not found");
  const client = await db.clients.get(intervention.clientId);

  const techName = localStorage.getItem("workflow:techName") ?? "";

  const json = {
    technician: techName,
    client: client?.name ?? "",
    ...intervention
  };

  download(
    `workflow-crm-${interventionId.slice(0, 8)}.json`,
    new Blob([JSON.stringify(json, null, 2)], { type: "application/json" })
  );

  const header = [
    "date",
    "technician",
    "client",
    "workCategory",
    "type",
    "status",
    "startAt",
    "endAt",
    "dueAt",
    "durationMinutes",
    "km",
    "notes"
  ];

  const row = [
    intervention.startAt ? new Date(intervention.startAt).toISOString().slice(0, 10) : "",
    techName,
    client?.name ?? "",
    intervention.workCategory ?? "intervention",
    intervention.type,
    intervention.status ?? "",
    intervention.startAt ?? "",
    intervention.endAt ?? "",
    intervention.dueAt ?? "",
    intervention.durationMinutes ?? "",
    intervention.km ?? "",
    intervention.notes ?? ""
  ];

  const csv = `${header.join(",")}\n${row.map(csvEscape).join(",")}\n`;
  download(
    `workflow-crm-${interventionId.slice(0, 8)}.csv`,
    new Blob([csv], { type: "text/csv" })
  );
}

export async function exportMonthForCrm(year: number, monthIndex0: number) {
  const start = startOfMonth(new Date(year, monthIndex0, 1)).toISOString();
  const end = endOfMonth(new Date(year, monthIndex0, 1)).toISOString();

  const techName = localStorage.getItem("workflow:techName") ?? "";
  const interventions = await db.interventions.where("startAt").between(start, end, true, true).toArray();
  const clients = await db.clients.toArray();
  const clientById = new Map(clients.map((c) => [c.id, c.name]));

  const json = {
    technician: techName,
    month: `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`,
    interventions: interventions.map((i) => ({
      ...i,
      clientName: clientById.get(i.clientId) ?? ""
    }))
  };

  download(
    `workflow-crm-${json.month}.json`,
    new Blob([JSON.stringify(json, null, 2)], { type: "application/json" })
  );

  const header = [
    "date",
    "technician",
    "client",
    "workCategory",
    "type",
    "status",
    "startAt",
    "endAt",
    "dueAt",
    "durationMinutes",
    "km",
    "notes"
  ];

  const lines = [header.join(",")];
  for (const i of interventions) {
    lines.push(
      [
        i.startAt ? new Date(i.startAt).toISOString().slice(0, 10) : "",
        techName,
        clientById.get(i.clientId) ?? "",
        i.workCategory ?? "intervention",
        i.type,
        i.status ?? "",
        i.startAt ?? "",
        i.endAt ?? "",
        i.dueAt ?? "",
        i.durationMinutes ?? "",
        i.km ?? "",
        i.notes ?? ""
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  download(
    `workflow-crm-${json.month}.csv`,
    new Blob([lines.join("\n") + "\n"], { type: "text/csv" })
  );
}

