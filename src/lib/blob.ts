export function dataUrlToBlob(dataUrl: string) {
  const [meta, data] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta ?? "")?.[1] ?? "application/octet-stream";
  const bytes = Uint8Array.from(atob(data ?? ""), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

