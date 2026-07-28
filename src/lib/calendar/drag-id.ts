/**
 * dnd-kit ids must be strings; events are identified by kind + row id.
 * "unoerp" events are always draggable=false (read-only), so this id is only
 * ever generated for them, never actually used in a drag-end handler.
 */
export function makeDragId(kind: "intervention" | "activity" | "unoerp", id: string): string {
  return `${kind}:${id}`;
}

export function parseDragId(dragId: string): { kind: "intervention" | "activity" | "unoerp"; id: string } {
  const idx = dragId.indexOf(":");
  return {
    kind: dragId.slice(0, idx) as "intervention" | "activity" | "unoerp",
    id: dragId.slice(idx + 1)
  };
}
