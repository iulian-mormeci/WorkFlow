"use client";

import { useEffect, useRef } from "react";
import {
  Bold,
  Heading,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Redo2,
  Underline,
  Undo2,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export type ProcedureEditorImage = { id: string; url: string };

type Props = {
  /** Stable key (procedure id / "new") — seeding the editor only happens when this changes. */
  seedKey: string;
  seedHtml: string;
  onChange: (html: string) => void;
  images: ProcedureEditorImage[];
  onPickFiles: (files: FileList | null) => void;
  onRemoveImage: (id: string) => void;
  busy?: boolean;
  placeholder?: string;
};

export function ProcedureEditor({
  seedKey,
  seedHtml,
  onChange,
  images,
  onPickFiles,
  onRemoveImage,
  busy,
  placeholder
}: Props) {
  const t = useTranslations();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Seed (or re-seed) the uncontrolled contentEditable surface when the target changes.
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = seedHtml || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  function emitChange() {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    try {
      document.execCommand(command, false, value);
    } catch {
      /* execCommand is best-effort */
    }
    emitChange();
  }

  const tools: { key: string; icon: typeof Bold; action: () => void; label: string }[] = [
    { key: "bold", icon: Bold, action: () => exec("bold"), label: t("procedures.editor.bold") },
    { key: "italic", icon: Italic, action: () => exec("italic"), label: t("procedures.editor.italic") },
    {
      key: "underline",
      icon: Underline,
      action: () => exec("underline"),
      label: t("procedures.editor.underline")
    },
    {
      key: "h3",
      icon: Heading,
      action: () => exec("formatBlock", "<h3>"),
      label: t("procedures.editor.heading")
    },
    {
      key: "ul",
      icon: List,
      action: () => exec("insertUnorderedList"),
      label: t("procedures.editor.bulletList")
    },
    {
      key: "ol",
      icon: ListOrdered,
      action: () => exec("insertOrderedList"),
      label: t("procedures.editor.numberedList")
    },
    { key: "undo", icon: Undo2, action: () => exec("undo"), label: t("procedures.editor.undo") },
    { key: "redo", icon: Redo2, action: () => exec("redo"), label: t("procedures.editor.redo") }
  ];

  return (
    <div className="rounded-xl border">
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 p-1.5">
        {tools.map((tool) => (
          <button
            key={tool.key}
            type="button"
            title={tool.label}
            aria-label={tool.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={tool.action}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            <tool.icon className="h-4 w-4" />
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <button
          type="button"
          title={t("procedures.editor.addImages")}
          aria-label={t("procedures.editor.addImages")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
          <span className="hidden sm:inline">{t("procedures.editor.addImages")}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onPickFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder ?? t("procedures.editor.contentLabel")}
        data-placeholder={placeholder ?? t("procedures.editor.placeholder")}
        onInput={emitChange}
        onBlur={emitChange}
        suppressContentEditableWarning
        className={cn(
          "procedure-rte min-h-40 max-h-[40vh] overflow-y-auto px-3 py-3 text-sm leading-relaxed",
          "focus-visible:outline-none"
        )}
      />

      {images.length ? (
        <div className="grid grid-cols-3 gap-2 border-t p-2 sm:grid-cols-4">
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <button
                type="button"
                aria-label={t("procedures.editor.removeImage")}
                onClick={() => onRemoveImage(img.id)}
                className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          {t("procedures.editor.noImages")}
        </div>
      )}
    </div>
  );
}
