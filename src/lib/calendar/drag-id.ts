/** dnd-kit ids must be strings; events are identified by kind + row id. */
export function makeDragId(kind: "intervention" | "activity", id: string): string {
  return `${kind}:${id}`;
}

export function parseDragId(dragId: string): { kind: "intervention" | "activity"; id: string } {
  const idx = dragId.indexOf(":");
  return { kind: dragId.slice(0, idx) as "intervention" | "activity", id: dragId.slice(idx + 1) };
}
