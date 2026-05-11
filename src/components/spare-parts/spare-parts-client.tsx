"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Wrench } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
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
import { useWorkflowLiveEpoch } from "@/hooks/use-workflow-live-epoch";
import { useTranslations } from "next-intl";

async function computeStockByPartId() {
  const moves = await db.stockMovements.toArray();
  const map = new Map<string, number>();
  for (const m of moves) {
    const prev = map.get(m.sparePartId) ?? 0;
    const delta = m.type === "out" ? -m.qty : m.qty;
    map.set(m.sparePartId, prev + delta);
  }
  return map;
}

export function SparePartsClient() {
  const t = useTranslations();
  const liveEpoch = useWorkflowLiveEpoch();
  const spareParts = useLiveQuery(async () => db.spareParts.orderBy("name").toArray(), [liveEpoch]);
  const stockByPartId = useLiveQuery(async () => await computeStockByPartId(), [liveEpoch]);

  const [addOpen, setAddOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState<null | string>(null);

  const [newPart, setNewPart] = useState({
    sku: "",
    name: "",
    unit: "pcs",
    minStock: ""
  });

  const [adjust, setAdjust] = useState({
    type: "adjust" as "in" | "out" | "adjust",
    qty: "",
    reason: ""
  });

  const canAdd = useMemo(() => newPart.sku.trim() && newPart.name.trim(), [newPart]);
  const canAdjust = useMemo(() => Number(adjust.qty) > 0, [adjust.qty]);

  async function createPart() {
    const nowIso = new Date().toISOString();
    await db.spareParts.add({
      id: crypto.randomUUID(),
      sku: newPart.sku.trim(),
      name: newPart.name.trim(),
      unit: newPart.unit.trim() || "pcs",
      minStock: newPart.minStock ? Number(newPart.minStock) : undefined,
      createdAt: nowIso,
      updatedAt: nowIso
    });
    setAddOpen(false);
    setNewPart({ sku: "", name: "", unit: "pcs", minStock: "" });
  }

  async function applyAdjustment(sparePartId: string) {
    const nowIso = new Date().toISOString();
    const qty = Number(adjust.qty);
    await db.stockMovements.add({
      id: crypto.randomUUID(),
      sparePartId,
      type: adjust.type,
      qty,
      reason: adjust.reason.trim() || undefined,
      createdAt: nowIso
    });
    setAdjustOpen(null);
    setAdjust({ type: "adjust", qty: "", reason: "" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {t("spareParts.list.count", { count: spareParts?.length ?? 0 })}
        </div>
        <Button onClick={() => setAddOpen(true)} size="lg">
          <Plus className="h-5 w-5" />
          {t("spareParts.actions.addPart")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b bg-muted px-4 py-3 text-sm font-medium">
          <div>{t("spareParts.table.part")}</div>
          <div className="text-right">{t("spareParts.table.stock")}</div>
          <div className="text-right">{t("spareParts.table.actions")}</div>
        </div>
        <div className="divide-y">
          {(spareParts ?? []).map((p) => {
            const stock = stockByPartId?.get(p.id) ?? 0;
            const low = p.minStock != null && stock < p.minStock;
            return (
              <div
                key={p.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-4"
              >
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">
                    {p.name}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("spareParts.row.meta", { sku: p.sku, unit: p.unit ?? "pcs" })}
                    {p.minStock != null ? ` • ${t("spareParts.row.min", { min: p.minStock })}` : ""}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <span className={low ? "font-semibold text-amber-700" : ""}>
                    {stock}
                  </span>{" "}
                  <span className="text-muted-foreground">{p.unit ?? "pcs"}</span>
                </div>
                <div className="text-right">
                  <Button variant="outline" onClick={() => setAdjustOpen(p.id)}>
                    <Wrench className="h-4 w-4" />
                    {t("spareParts.actions.adjust")}
                  </Button>
                </div>
              </div>
            );
          })}

          {(spareParts ?? []).length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t("spareParts.empty")}
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("spareParts.dialogs.add.title")}</DialogTitle>
            <DialogDescription>{t("spareParts.dialogs.add.subtitle")}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-3">
            <div className="grid gap-2">
              <Label>{t("spareParts.fields.sku")}</Label>
              <Input value={newPart.sku} onChange={(e) => setNewPart((s) => ({ ...s, sku: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{t("spareParts.fields.name")}</Label>
              <Input value={newPart.name} onChange={(e) => setNewPart((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("spareParts.fields.unit")}</Label>
                <Input value={newPart.unit} onChange={(e) => setNewPart((s) => ({ ...s, unit: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{t("spareParts.fields.minStock")}</Label>
                <Input inputMode="numeric" value={newPart.minStock} onChange={(e) => setNewPart((s) => ({ ...s, minStock: e.target.value }))} />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)} type="button">
                {t("common.cancel")}
              </Button>
              <Button disabled={!canAdd} onClick={createPart} type="button">
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(adjustOpen)} onOpenChange={(v) => setAdjustOpen(v ? adjustOpen : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("spareParts.dialogs.adjust.title")}</DialogTitle>
            <DialogDescription>
              {t("spareParts.dialogs.adjust.subtitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-3">
            <div className="grid gap-2">
              <Label>{t("spareParts.fields.movementType")}</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["in", "out", "adjust"] as const).map((mt) => (
                  <Button
                    key={mt}
                    variant={adjust.type === mt ? "default" : "outline"}
                    onClick={() => setAdjust((s) => ({ ...s, type: mt }))}
                    type="button"
                  >
                    {mt === "in"
                      ? t("spareParts.movementTypes.in")
                      : mt === "out"
                        ? t("spareParts.movementTypes.out")
                        : t("spareParts.movementTypes.adjust")}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("spareParts.fields.quantity")}</Label>
                <Input
                  inputMode="numeric"
                  value={adjust.qty}
                  onChange={(e) => setAdjust((s) => ({ ...s, qty: e.target.value }))}
                  placeholder={t("common.numericZero")}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("spareParts.fields.reason")}</Label>
                <Input
                  value={adjust.reason}
                  onChange={(e) => setAdjust((s) => ({ ...s, reason: e.target.value }))}
                  placeholder={t("spareParts.reasonPlaceholder")}
                />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setAdjustOpen(null)} type="button">
                {t("common.cancel")}
              </Button>
              <Button
                disabled={!canAdjust || !adjustOpen}
                onClick={() => adjustOpen && applyAdjustment(adjustOpen)}
                type="button"
              >
                {t("spareParts.actions.saveMovement")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

