"use client";

import { useRef, useState } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { validateFileForUpload, uploadFile } from "@/lib/files/shared-files";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type Props = {
  userId: string;
  parentId: string | null;
  onUploaded: () => void;
  onError: (msg: string) => void;
};

export function FileUploadZone({ userId, parentId, onUploaded, onError }: Props) {
  const t = useTranslations("files");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<{ name: string; pct: number } | null>(null);

  async function processFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;

    for (const file of list) {
      const err = validateFileForUpload(file);
      if (err) {
        onError(t(`upload.errors.${err}`));
        continue;
      }

      setUploading({ name: file.name, pct: 0 });
      try {
        await uploadFile(file, userId, parentId, (pct) =>
          setUploading({ name: file.name, pct })
        );
        onUploaded();
      } catch (e) {
        onError(e instanceof Error ? e.message : t("upload.errors.generic"));
      } finally {
        setUploading(null);
      }
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    void processFiles(e.dataTransfer.files);
  }

  return (
    <div
      className={cn(
        "relative flex min-h-32 cursor-pointer flex-col items-center justify-center gap-3",
        "rounded-2xl border-2 border-dashed transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 bg-muted/30 hover:bg-muted/50"
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => { void processFiles(e.target.files ?? []); e.currentTarget.value = ""; }}
      />

      {uploading ? (
        <div className="flex flex-col items-center gap-2 px-4 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm font-medium">{uploading.name}</p>
          <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${uploading.pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{uploading.pct}%</p>
        </div>
      ) : (
        <>
          <CloudUpload className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium">{t("upload.dropHere")}</p>
            <p className="text-xs text-muted-foreground">{t("upload.hint")}</p>
          </div>
        </>
      )}
    </div>
  );
}
