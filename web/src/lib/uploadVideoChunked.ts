/** Upload vidéo par chunks vers /api/upload-video (bypass limite ~100 Mo Cloudflare). */

const CHUNK_BYTES = 40 * 1024 * 1024; // 40 Mo < limite CF
export const CHUNK_THRESHOLD_BYTES = 80 * 1024 * 1024; // 80 Mo

function newUploadId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `up_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `up_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function uploadVideoChunked(
  file: File,
  sessionId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const uploadId = newUploadId();
  const total = Math.max(1, Math.ceil(file.size / CHUNK_BYTES));

  for (let index = 0; index < total; index++) {
    const start = index * CHUNK_BYTES;
    const end = Math.min(file.size, start + CHUNK_BYTES);
    const blob = file.slice(start, end);

    const res = await fetch("/api/upload-video", {
      method: "POST",
      headers: {
        "x-session-id": sessionId,
        "x-upload-id": uploadId,
        "x-chunk-index": String(index),
        "x-chunk-total": String(total),
        "x-filename": file.name || "video.mp4",
        "x-content-type": file.type || "video/mp4",
        "x-total-bytes": String(file.size),
      },
      body: blob,
    });

    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      storageId?: string;
    };
    if (!res.ok) {
      throw new Error(body.error || `Upload chunk échoué (${res.status})`);
    }
    onProgress?.(index + 1, total);

    if (index === total - 1) {
      if (!body.storageId) {
        throw new Error("Upload terminé sans storageId");
      }
      return body.storageId;
    }
  }
  throw new Error("Upload incomplet");
}
