"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Responsive, WidthProvider, type Layout as RglLayout } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import { Check, GripVertical, Plus, Settings2, X } from "lucide-react";
import { db, type DashboardWidgetPref } from "@/lib/db/workflow-db";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { saveUserPreferences } from "@/lib/user-settings/user-preferences";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DEFAULT_VISIBLE_WIDGETS,
  GRID_COLS,
  GRID_COLS_TABLET,
  GRID_ROW_HEIGHT,
  WIDGET_CATEGORIES,
  WIDGET_CATEGORY_BY_ID,
  WIDGET_DEFAULT_LAYOUT,
  WIDGET_ICON_BY_ID,
  WIDGET_IDS,
  type WidgetId
} from "@/lib/dashboard/widget-registry";
import { WIDGET_COMPONENTS } from "@/components/dashboard/widgets/widget-registry";
import { useTranslations } from "next-intl";

const ResponsiveGridLayout = WidthProvider(Responsive);
const BREAKPOINTS = { lg: 1024, md: 640, xs: 0 };
const COLS = { lg: GRID_COLS, md: GRID_COLS_TABLET, xs: 1 };

/** Simple skyline bin-packer: places each widget at the leftmost column with the lowest free y. */
function packPositions(ids: readonly WidgetId[]): Record<string, { x: number; y: number }> {
  const colHeights = new Array(GRID_COLS).fill(0);
  const positions: Record<string, { x: number; y: number }> = {};
  for (const id of ids) {
    const { w, h } = WIDGET_DEFAULT_LAYOUT[id];
    let bestX = 0;
    let bestY = Infinity;
    for (let x = 0; x + w <= GRID_COLS; x++) {
      const y = Math.max(...colHeights.slice(x, x + w));
      if (y < bestY) {
        bestY = y;
        bestX = x;
      }
    }
    positions[id] = { x: bestX, y: bestY };
    for (let x = bestX; x < bestX + w; x++) colHeights[x] = bestY + h;
  }
  return positions;
}

function mergeWithDefaults(saved: DashboardWidgetPref[] | undefined): DashboardWidgetPref[] {
  const byId = new Map((saved ?? []).map((w) => [w.id, w]));
  const needsPosition = WIDGET_IDS.filter((id) => {
    const existing = byId.get(id);
    return !existing || existing.x == null || existing.y == null;
  });
  const positions = packPositions(needsPosition);

  return WIDGET_IDS.map((id) => {
    const existing = byId.get(id);
    const visible = existing?.visible ?? (DEFAULT_VISIBLE_WIDGETS as readonly string[]).includes(id);
    const size = WIDGET_DEFAULT_LAYOUT[id];
    const pos = positions[id];
    return {
      id,
      visible,
      x: existing?.x ?? pos?.x ?? 0,
      y: existing?.y ?? pos?.y ?? 0,
      w: existing?.w ?? size.w,
      h: existing?.h ?? size.h
    };
  });
}

function toRglLayout(order: DashboardWidgetPref[]): RglLayout {
  return order
    .filter((w) => w.visible)
    .map((w) => {
      const size = WIDGET_DEFAULT_LAYOUT[w.id as WidgetId];
      return {
        i: w.id,
        x: w.x ?? 0,
        y: w.y ?? 0,
        w: w.w ?? size.w,
        h: w.h ?? size.h,
        minW: size.minW,
        minH: size.minH,
        maxW: size.maxW,
        maxH: size.maxH
      };
    });
}

function WidgetGallery({
  open,
  onOpenChange,
  order,
  onAdd,
  onRemove
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: DashboardWidgetPref[];
  onAdd: (id: WidgetId) => void;
  onRemove: (id: WidgetId) => void;
}) {
  const t = useTranslations("dashboard");
  const byId = new Map(order.map((w) => [w.id, w.visible]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("gallery.title")}</DialogTitle>
          <DialogDescription>{t("gallery.subtitle")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {WIDGET_CATEGORIES.map((cat) => {
            const ids = WIDGET_IDS.filter((id) => WIDGET_CATEGORY_BY_ID[id] === cat);
            return (
              <div key={cat} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`gallery.categories.${cat}`)}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ids.map((id) => {
                    const Icon = WIDGET_ICON_BY_ID[id];
                    const isVisible = byId.get(id) ?? false;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => (isVisible ? onRemove(id) : onAdd(id))}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors",
                          isVisible ? "border-primary bg-primary/5" : "hover:bg-muted"
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{t(`widgets.${id}.title`)}</div>
                        </div>
                        {isVisible ? (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CustomizableWidgets() {
  const t = useTranslations("dashboard.customize");
  const [userId, setUserId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [liveLayout, setLiveLayout] = useState<RglLayout | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const settings = useLiveQuery(async () => (userId ? db.userSettings.get(userId) : undefined), [userId]);
  const order = useMemo(
    () => mergeWithDefaults(settings?.preferences?.dashboardWidgets),
    [settings]
  );

  const visibleIdsKey = order
    .filter((w) => w.visible)
    .map((w) => w.id)
    .join(",");

  // Drop the locally-tracked (mid-drag) layout whenever the *set* of visible
  // widgets changes (added/removed via the gallery) so it doesn't shadow the
  // freshly persisted positions — but keep it during pure drag/resize, where
  // the visible set is unchanged and we want smooth live feedback.
  useEffect(() => {
    setLiveLayout(null);
  }, [visibleIdsKey]);

  const persistLayout = async (layout: RglLayout) => {
    if (!userId) return;
    const byId = new Map(layout.map((l) => [l.i, l]));
    const next = order.map((w) => {
      const l = byId.get(w.id);
      return l ? { ...w, x: l.x, y: l.y, w: l.w, h: l.h } : w;
    });
    await saveUserPreferences(userId, { dashboardWidgets: next });
  };

  const removeWidget = (id: WidgetId) => {
    if (!userId) return;
    void saveUserPreferences(userId, {
      dashboardWidgets: order.map((w) => (w.id === id ? { ...w, visible: false } : w))
    });
  };

  const addWidget = (id: WidgetId) => {
    if (!userId) return;
    void saveUserPreferences(userId, {
      dashboardWidgets: order.map((w) => (w.id === id ? { ...w, visible: true } : w))
    });
  };

  const baseLayout = useMemo(() => toRglLayout(order), [order]);
  const layout = liveLayout ?? baseLayout;
  const visible = order.filter((w) => w.visible);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("sectionTitle")}</h2>
        <div className="flex gap-2">
          {editMode && (
            <Button type="button" variant="outline" size="sm" onClick={() => setGalleryOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("addWidget")}
            </Button>
          )}
          <Button
            type="button"
            variant={editMode ? "default" : "outline"}
            size="sm"
            onClick={() => setEditMode((v) => !v)}
          >
            <Settings2 className="h-4 w-4" />
            {editMode ? t("done") : t("button")}
          </Button>
        </div>
      </div>

      <ResponsiveGridLayout
        className="wf-dashboard-grid"
        layouts={{ lg: layout }}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={GRID_ROW_HEIGHT}
        margin={[16, 16]}
        containerPadding={[0, 0]}
        compactType="vertical"
        isDraggable={editMode}
        isResizable={editMode}
        draggableHandle=".wf-widget-drag-handle"
        onDrag={(l) => setLiveLayout(l)}
        onResize={(l) => setLiveLayout(l)}
        onDragStop={(l) => void persistLayout(l)}
        onResizeStop={(l) => void persistLayout(l)}
      >
        {visible.map((w) => {
          const Widget = WIDGET_COMPONENTS[w.id as WidgetId];
          if (!Widget) return null;
          return (
            <div key={w.id} className="relative">
              {editMode && (
                <>
                  <button
                    type="button"
                    onClick={() => removeWidget(w.id as WidgetId)}
                    aria-label={t("removeWidget")}
                    className="absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div
                    className="wf-widget-drag-handle absolute -left-2 -top-2 z-20 flex h-6 w-6 cursor-grab touch-none items-center justify-center rounded-full border bg-background shadow-md active:cursor-grabbing"
                    aria-label={t("dragHandleAria")}
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </div>
                </>
              )}
              <div
                className={cn(
                  "h-full w-full overflow-y-auto rounded-2xl",
                  editMode && "pointer-events-none ring-2 ring-dashed ring-primary/30"
                )}
              >
                <Widget />
              </div>
            </div>
          );
        })}
      </ResponsiveGridLayout>

      {visible.length === 0 && (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("emptyDashboard")}
        </div>
      )}

      <WidgetGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        order={order}
        onAdd={addWidget}
        onRemove={removeWidget}
      />
    </div>
  );
}
