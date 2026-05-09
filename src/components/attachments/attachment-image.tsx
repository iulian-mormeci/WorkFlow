"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/workflow-db";

export function AttachmentImage({
  id,
  className,
  alt
}: {
  id: string;
  className?: string;
  alt?: string;
}) {
  const attachment = useLiveQuery(async () => await db.attachments.get(id), [id]);
  const [url, setUrl] = useState<string | null>(null);

  const blob = attachment?.blob ?? null;

  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  const safeAlt = useMemo(() => alt ?? attachment?.name ?? "attachment", [alt, attachment?.name]);

  if (!url) return null;

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={safeAlt} className={className} />;
}

