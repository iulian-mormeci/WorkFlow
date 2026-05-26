"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";

export type ChecklistRow = { id: string; label: string; done: boolean };

function SortableRow({
  item,
  onToggle,
  onLabel,
  onRemove
  ,
  dragAriaLabel
  ,
  itemPlaceholder
}: {
  item: ChecklistRow;
  onToggle: () => void;
  onLabel: (v: string) => void;
  onRemove: () => void;
  dragAriaLabel: string;
  itemPlaceholder: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-2 sm:flex-nowrap"
    >
      <button
        type="button"
        className="touch-manipulation rounded-lg p-2 text-muted-foreground hover:bg-muted"
        aria-label={dragAriaLabel}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Checkbox checked={item.done} onCheckedChange={onToggle} className="mt-0.5" />
      <Input
        value={item.label}
        onChange={(e) => onLabel(e.target.value)}
        placeholder={itemPlaceholder}
        className="min-w-0 flex-1"
      />
      <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

type Props = {
  value: ChecklistRow[];
  onChange: (next: ChecklistRow[]) => void;
  label?: string;
  /** Quick-add chips from the user's frequent checklist labels. */
  suggestions?: string[];
};

export function DynamicChecklistEditor({
  value,
  onChange,
  label = "Checklist",
  suggestions = []
}: Props) {
  const t = useTranslations();
  const [draft, setDraft] = useState("");
  const ids = useMemo(() => value.map((x) => x.id), [value]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd(ev: DragEndEvent) {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oldIndex = value.findIndex((x) => x.id === String(active.id));
    const newIndex = value.findIndex((x) => x.id === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(value, oldIndex, newIndex));
  }

  function addItem(text?: string) {
    const t = (text ?? draft).trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (value.some((x) => x.label.trim().toLowerCase() === key)) return;
    onChange([
      ...value,
      { id: crypto.randomUUID(), label: t, done: false }
    ]);
    setDraft("");
  }

  const visibleSuggestions = suggestions.filter((s) => {
    const key = s.trim().toLowerCase();
    return key.length > 1 && !value.some((x) => x.label.trim().toLowerCase() === key);
  });

  return (
    <div className="grid gap-2">
      <Label>{label === "Checklist" ? t("checklist.editor.title") : label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("checklist.editor.newItemPlaceholder")}
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
        />
        <Button type="button" variant="secondary" className="shrink-0 min-h-11 touch-manipulation" onClick={() => addItem()}>
          <Plus className="mr-2 h-4 w-4" />
          {t("common.add")}
        </Button>
      </div>

      {visibleSuggestions.length > 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t("checklist.suggestions.title")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {visibleSuggestions.map((s) => (
              <Button
                key={s}
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10 touch-manipulation rounded-full px-3 text-left"
                aria-label={t("checklist.suggestions.addAria", { label: s })}
                onClick={() => addItem(s)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{s}</span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {value.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          {t("checklist.editor.empty")}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="grid gap-2">
              {value.map((item) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  dragAriaLabel={t("checklist.editor.dragToReorder")}
                  itemPlaceholder={t("checklist.editor.itemPlaceholder")}
                  onToggle={() =>
                    onChange(value.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)))
                  }
                  onLabel={(v) =>
                    onChange(value.map((x) => (x.id === item.id ? { ...x, label: v } : x)))
                  }
                  onRemove={() => onChange(value.filter((x) => x.id !== item.id))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
