/**
 * Storage upload with XMLHttpRequest progress + retries (Section Sync 2).
 */
export type UploadProgress = {
  loaded: number;
  total: number;
  percentage: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function encodeStorageObjectPath(path: string): string {
  return path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/**
 * Upload raw bytes to Supabase Storage REST (supports upload progress).
 */
export async function uploadToSupabaseStorageWithRetries(opts: {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  bucket: string;
  objectPath: string;
  body: Blob;
  contentType: string;
  upsert?: boolean;
  maxRetries?: number;
  onProgress?: (p: UploadProgress) => void;
}): Promise<void> {
  const {
    supabaseUrl,
    anonKey,
    accessToken,
    bucket,
    objectPath,
    body,
    contentType,
    upsert = true,
    maxRetries = 3,
    onProgress
  } = opts;

  const encodedPath = encodeStorageObjectPath(objectPath);
  const url = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${bucket}/${encodedPath}`;

  let attempt = 0;
  let lastErr: Error | null = null;

  while (attempt < maxRetries) {
    attempt += 1;
    try {
      await xhrUpload(url, accessToken, anonKey, body, contentType, upsert, onProgress);
      return;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt >= maxRetries) break;
      const backoff = 400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
      await sleep(backoff);
    }
  }

  throw lastErr ?? new Error("Upload failed");
}

function xhrUpload(
  url: string,
  accessToken: string,
  anonKey: string,
  body: Blob,
  contentType: string,
  upsert: boolean,
  onProgress?: (p: UploadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", anonKey);
    if (upsert) xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream");

    xhr.upload.onprogress = (ev) => {
      if (!onProgress || !ev.lengthComputable) return;
      const total = ev.total || body.size || 1;
      onProgress({
        loaded: ev.loaded,
        total,
        percentage: Math.min(100, Math.round((ev.loaded / total) * 100))
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({
          loaded: body.size,
          total: body.size,
          percentage: 100
        });
        resolve();
      } else {
        reject(new Error(xhr.responseText || `Upload HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload aborted"));

    xhr.send(body);
  });
}
