"use client";

import { useState, useRef, useCallback, useEffect, useId } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuthStore } from "@/stores/auth";
import { isGlobalProcedureAdmin } from "@/lib/procedures/global-procedure-admin";
import { getUserPreferences } from "@/lib/user-settings/user-preferences";

const DESC_MAX = 20;

type ExtractedItem = {
  id: string;
  prodotto: string;
  description: string;      // ≤20 chars → DESCRIPTION column
  descrizione_lunga: string;
  gruppo: string;
  reparto: string;
  prezzi: number[];
};

type ExtractError = {
  raw: unknown;
  reason: string;
};

type Settings = {
  pluStart: number;
  duplicateDesc: boolean;
  separator: string;
  encoding: "utf8bom" | "utf8";
};

const DEFAULT_SETTINGS: Settings = {
  pluStart: 1,
  duplicateDesc: false,
  separator: ";",
  encoding: "utf8bom"
};

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function emptyItem(): ExtractedItem {
  return { id: makeId(), prodotto: "", description: "", descrizione_lunga: "", gruppo: "", reparto: "", prezzi: [0] };
}

// ─── Sortable row ─────────────────────────────────────────────────────────────

type RowProps = {
  item: ExtractedItem;
  plu: number;
  onChange: (id: string, field: keyof Omit<ExtractedItem, "id" | "prezzi">, value: string) => void;
  onPriceChange: (id: string, index: number, value: string) => void;
  onDelete: (id: string) => void;
};

function SortableRow({ item, plu, onChange, onPriceChange, onDelete }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const td = "border-r border-border last:border-r-0 px-1.5 py-1 text-xs align-middle";
  const inp = "w-full bg-transparent outline-none focus:bg-muted/50 rounded px-1 py-0.5 min-w-0";
  const ro = "text-center font-mono text-muted-foreground select-none";

  const descOver = item.description.length > DESC_MAX;

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-border hover:bg-muted/20">
      {/* drag */}
      <td className={`${td} w-6 cursor-grab active:cursor-grabbing`} {...attributes} {...listeners}>
        <span className="text-muted-foreground select-none">⠿</span>
      </td>
      {/* #PLU */}
      <td className={`${td} w-10 ${ro}`}>{plu}</td>
      {/* GROUP */}
      <td className={`${td} min-w-[90px]`}>
        <input className={inp} value={item.gruppo} onChange={(e) => onChange(item.id, "gruppo", e.target.value)} />
      </td>
      {/* DEPT */}
      <td className={`${td} min-w-[90px]`}>
        <input className={inp} value={item.reparto} onChange={(e) => onChange(item.id, "reparto", e.target.value)} />
      </td>
      {/* DESCRIPTION ≤20 */}
      <td className={`${td} min-w-[140px]`}>
        <div className="flex flex-col gap-0.5">
          <input
            className={`${inp} ${descOver ? "text-destructive ring-1 ring-destructive/50 rounded" : ""}`}
            maxLength={30}
            value={item.description}
            onChange={(e) => onChange(item.id, "description", e.target.value)}
          />
          <span className={`text-[10px] leading-none ${descOver ? "text-destructive" : "text-muted-foreground/60"}`}>
            {item.description.length}/{DESC_MAX}
          </span>
        </div>
      </td>
      {/* LONG_DESCRIPTION */}
      <td className={`${td} min-w-[160px]`}>
        <input className={inp} value={item.descrizione_lunga} onChange={(e) => onChange(item.id, "descrizione_lunga", e.target.value)} />
      </td>
      {/* KP_PLU_NOTES — always empty, read-only */}
      <td className={`${td} w-12 ${ro}`}>—</td>
      {/* PRICE_1 … PRICE_6 */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <td key={i} className={`${td} w-18`}>
          <input
            className={`${inp} text-right font-mono`}
            value={item.prezzi[i] !== undefined ? String(item.prezzi[i]) : ""}
            placeholder={i === 0 ? "0.00" : ""}
            onChange={(e) => onPriceChange(item.id, i, e.target.value)}
          />
        </td>
      ))}
      {/* BARCODE — always empty */}
      <td className={`${td} w-10 ${ro}`}>—</td>
      {/* PREFERED — always empty */}
      <td className={`${td} w-10 ${ro}`}>—</td>
      {/* ON_TDE — always 1 */}
      <td className={`${td} w-10 ${ro}`}>1</td>
      {/* Delete */}
      <td className={`${td} w-8 text-center`}>
        <button onClick={() => onDelete(item.id)} className="text-destructive hover:text-destructive/70 transition-colors text-base leading-none" aria-label="Elimina">×</button>
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Phase = "idle" | "uploading" | "preview" | "done" | "error";

export function MenuToCsvClient() {
  const t = useTranslations("menuToCsv");
  const user = useAuthStore((s) => s.user);
  const isAdmin = isGlobalProcedureAdmin(user);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [extractErrors, setExtractErrors] = useState<ExtractError[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneId = useId();

  useEffect(() => {
    if (!user?.id) return;
    getUserPreferences(user.id).then((prefs) => {
      setSettings({
        pluStart: prefs.menuToCsvPluStart ?? DEFAULT_SETTINGS.pluStart,
        duplicateDesc: prefs.menuToCsvDuplicateDesc ?? DEFAULT_SETTINGS.duplicateDesc,
        separator: prefs.menuToCsvSeparator ?? DEFAULT_SETTINGS.separator,
        encoding: prefs.menuToCsvEncoding ?? DEFAULT_SETTINGS.encoding
      });
    });
  }, [user?.id]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function validateFile(file: File): string | null {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return t("errorNotPdf");
    if (file.size > 10 * 1_048_576) return t("errorTooLarge");
    return null;
  }

  function handleFileSelect(file: File) {
    const err = validateFile(file);
    if (err) { setErrorMsg(err); setPhase("error"); return; }
    setSelectedFile(file);
    setPhase("idle");
    setErrorMsg("");
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  async function handleExtract() {
    if (!selectedFile) return;
    setPhase("uploading");
    setErrorMsg("");

    try {
      const form = new FormData();
      form.append("pdf", selectedFile);
      const res = await fetch("/api/menu-to-csv", { method: "POST", body: form });

      if (!res.ok) {
        let errMsg = t("errorGeneric");
        if (res.status === 413) errMsg = t("errorTooLarge");
        else if (res.status === 503) errMsg = "Chiave API AI non configurata sul server.";
        else if (res.status === 429) errMsg = "Troppe richieste, riprova tra qualche minuto.";
        else {
          try { const d = (await res.json()) as { error?: string }; errMsg = d.error || t("errorGeneric"); }
          catch { errMsg = `${t("errorGeneric")} (HTTP ${res.status})`; }
        }
        throw new Error(errMsg);
      }

      const data = (await res.json()) as {
        items: Omit<ExtractedItem, "id">[];
        errors: ExtractError[];
      };

      setItems(data.items.map((item) => ({ ...item, id: makeId() })));
      setExtractErrors(data.errors ?? []);
      setPhase("preview");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : t("errorGeneric"));
      setPhase("error");
    }
  }

  const handleFieldChange = useCallback(
    (id: string, field: keyof Omit<ExtractedItem, "id" | "prezzi">, value: string) => {
      setItems((prev) => prev.map((item) => item.id === id ? { ...item, [field]: value } : item));
    }, []
  );

  const handlePriceChange = useCallback((id: string, index: number, value: string) => {
    setItems((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      const prezzi = [...item.prezzi];
      const num = parseFloat(value.replace(",", "."));
      if (value === "") { prezzi[index] = undefined as unknown as number; }
      else if (!isNaN(num)) { prezzi[index] = num; }
      while (prezzi.length > 1 && prezzi[prezzi.length - 1] === undefined) prezzi.pop();
      return { ...item, prezzi };
    }));
  }, []);

  const handleDelete = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  function handleAddRow() { setItems((prev) => [...prev, emptyItem()]); }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === active.id);
        const newIndex = prev.findIndex((i) => i.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  async function handleGenerateCsv() {
    try {
      const body = {
        items: items.map(({ description, descrizione_lunga, gruppo, reparto, prezzi }) => ({
          description,
          descrizione_lunga,
          gruppo,
          reparto,
          prezzi: prezzi.filter((p) => typeof p === "number" && isFinite(p))
        })),
        settings
      };

      const res = await fetch("/api/menu-to-csv/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error(t("errorGeneric"));

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "menu-rt.csv";
      a.click();
      URL.revokeObjectURL(url);
      setPhase("done");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : t("errorGeneric"));
      setPhase("error");
    }
  }

  function handleNewExtraction() {
    setPhase("idle");
    setSelectedFile(null);
    setItems([]);
    setExtractErrors([]);
    setErrorMsg("");
  }

  function pluForIndex(idx: number) { return settings.pluStart + idx; }

  // Column headers (matches CSV exactly)
  const HEADERS = [
    "", "#PLU", "GROUP", "DEPT",
    `DESCRIPTION (max ${DESC_MAX})`,
    "LONG_DESCRIPTION", "KP_PLU_NOTES",
    "PRICE_1", "PRICE_2", "PRICE_3", "PRICE_4", "PRICE_5", "PRICE_6",
    "BARCODE", "PREFERED", "ON_TDE", ""
  ];

  // Visual groups for the group header rows
  const groups = (() => {
    const seen = new Map<string, { gruppo: string; reparto: string; ids: string[] }>();
    for (const item of items) {
      const key = `${item.gruppo}||${item.reparto}`;
      if (!seen.has(key)) seen.set(key, { gruppo: item.gruppo, reparto: item.reparto, ids: [] });
      seen.get(key)!.ids.push(item.id);
    }
    return [...seen.values()];
  })();

  return (
    <div className="space-y-6">
      {isAdmin && phase === "idle" && (
        <div className="flex justify-end">
          <Link href="/menu-to-csv/settings" className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
            Impostazioni esportazione →
          </Link>
        </div>
      )}

      {/* ── Upload zone ── */}
      {(phase === "idle" || phase === "error") && (
        <div className="space-y-4">
          <div
            id={dropZoneId}
            role="button"
            tabIndex={0}
            aria-label="Zona caricamento PDF"
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
          >
            <span className="text-4xl">📄</span>
            <p className="text-sm font-medium">
              {t("upload.dragDrop")}{" "}
              <span className="text-primary underline underline-offset-2">{t("upload.browse")}</span>
            </p>
            <p className="text-xs text-muted-foreground">{t("upload.pdfOnly")}</p>
            {selectedFile && (
              <div className="rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="font-medium">{selectedFile.name}</span>{" "}
                <span className="text-muted-foreground">({(selectedFile.size / 1_048_576).toFixed(2)} MB)</span>
              </div>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onInputChange} />

          {errorMsg && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive font-medium">
              {errorMsg}
            </div>
          )}

          {selectedFile && (
            <button onClick={handleExtract} className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
              {t("upload.extract")}
            </button>
          )}
        </div>
      )}

      {/* ── Loading ── */}
      {phase === "uploading" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium">{t("upload.extracting")}</p>
          <p className="text-xs text-muted-foreground">{t("upload.extractingHint")}</p>
        </div>
      )}

      {/* ── Preview table ── */}
      {(phase === "preview" || phase === "done") && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{t("preview.title")}</p>
              <p className="text-xs text-muted-foreground">{t("preview.subtitle")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={handleAddRow} className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted">
                + {t("preview.addRow")}
              </button>
              <button onClick={handleGenerateCsv} className="inline-flex h-8 items-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90">
                {t("preview.generateCsv")}
              </button>
              <button onClick={handleNewExtraction} className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted">
                {t("preview.newExtraction")}
              </button>
            </div>
          </div>

          {phase === "done" && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 dark:bg-green-950/20 dark:border-green-900 dark:text-green-400">
              {t("success")}
            </div>
          )}

          {/* Group pills */}
          {groups.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <span key={`${g.gruppo}||${g.reparto}`} className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {g.gruppo !== g.reparto ? `${g.gruppo} › ${g.reparto}` : g.gruppo}
                  <span className="ml-1 opacity-60">({g.ids.length})</span>
                </span>
              ))}
            </div>
          )}

          {/* Scrollable table — full bleed on mobile */}
          <div className="w-full overflow-x-auto rounded-lg border border-border" style={{ WebkitOverflowScrolling: "touch" }}>
            <table className="border-collapse text-xs" style={{ minWidth: "max-content" }}>
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {HEADERS.map((h, i) => (
                    <th key={i} className="border-r border-border last:border-r-0 px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap sticky top-0 bg-muted/50">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <tbody>
                    {groups.map((group) => (
                      <>
                        {groups.length > 1 && (
                          <tr key={`hdr-${group.gruppo}-${group.reparto}`} className="bg-muted/30 border-b border-border">
                            <td colSpan={HEADERS.length} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                              {group.gruppo !== group.reparto ? `${group.gruppo} › ${group.reparto}` : group.gruppo}
                            </td>
                          </tr>
                        )}
                        {group.ids.map((id) => {
                          const item = items.find((i) => i.id === id)!;
                          const globalIdx = items.findIndex((i) => i.id === id);
                          return (
                            <SortableRow
                              key={id}
                              item={item}
                              plu={pluForIndex(globalIdx)}
                              onChange={handleFieldChange}
                              onPriceChange={handlePriceChange}
                              onDelete={handleDelete}
                            />
                          );
                        })}
                      </>
                    ))}
                  </tbody>
                </SortableContext>
              </DndContext>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            {items.length} {items.length === 1 ? "voce" : "voci"} · PLU {settings.pluStart}–{settings.pluStart + items.length - 1}
          </p>
        </div>
      )}

      {/* ── Discarded items ── */}
      {extractErrors.length > 0 && (phase === "preview" || phase === "done") && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-destructive">{t("errors.title")}</p>
            <p className="text-xs text-muted-foreground">{t("errors.subtitle")}</p>
          </div>
          <div className="space-y-1.5">
            {extractErrors.map((err, i) => (
              <div key={i} className="rounded bg-background/70 px-3 py-2 text-xs">
                <span className="font-medium text-destructive">{err.reason}:</span>{" "}
                <span className="font-mono text-muted-foreground">{JSON.stringify(err.raw).slice(0, 120)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
