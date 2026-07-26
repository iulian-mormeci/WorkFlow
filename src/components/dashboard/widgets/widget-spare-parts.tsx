"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Package } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { GenericListWidget } from "@/components/dashboard/widgets/generic-list-widget";
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

const LIMIT = 5;

export function WidgetSpareParts() {
  const t = useTranslations("dashboard.widgets.spareParts");
  const liveEpoch = useWorkflowLiveEpoch();

  const lowStock = useLiveQuery(async () => {
    const [parts, stockByPartId] = await Promise.all([db.spareParts.toArray(), computeStockByPartId()]);
    return parts
      .filter((p) => p.minStock != null && (stockByPartId.get(p.id) ?? 0) < p.minStock)
      .map((p) => ({ part: p, stock: stockByPartId.get(p.id) ?? 0 }))
      .sort((a, b) => a.stock - b.stock)
      .slice(0, LIMIT);
  }, [liveEpoch]);

  return (
    <GenericListWidget
      title={t("title")}
      subtitle={t("subtitle")}
      icon={Package}
      viewAllHref="/spare-parts"
      viewAllLabel={t("viewAll")}
      emptyLabel={t("empty")}
      loading={lowStock === undefined}
      items={(lowStock ?? []).map(({ part, stock }) => ({
        id: part.id,
        title: part.name,
        subtitle: t("stockLine", { stock, min: part.minStock ?? 0 })
      }))}
    />
  );
}
