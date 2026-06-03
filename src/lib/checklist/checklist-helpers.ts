/** Checklist item with optional toggle audit trail (stored on interventions / templates). */
export type ChecklistToggleEvent = { done: boolean; at: string };

export type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  toggleHistory?: ChecklistToggleEvent[];
};

/** @deprecated Use ChecklistItem — kept for editor import compatibility. */
export type ChecklistRow = ChecklistItem;

export function toggleChecklistItem(items: ChecklistItem[], itemId: string): ChecklistItem[] {
  const at = new Date().toISOString();
  return items.map((item) => {
    if (item.id !== itemId) return item;
    const done = !item.done;
    const toggleHistory = [...(item.toggleHistory ?? []), { done, at }];
    return { ...item, done, toggleHistory };
  });
}

export function flattenChecklistTimeline(
  items: ChecklistItem[]
): { itemId: string; label: string; done: boolean; at: string }[] {
  const events: { itemId: string; label: string; done: boolean; at: string }[] = [];
  for (const item of items) {
    for (const ev of item.toggleHistory ?? []) {
      events.push({
        itemId: item.id,
        label: item.label,
        done: ev.done,
        at: ev.at
      });
    }
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}
