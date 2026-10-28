import { api } from "./client";
import type { ApiMeta } from "./types";

/** Shapes returned by GET /admin/media (compact) and GET /admin/media/:id (full). */
export type MediaCategory = "images" | "videos" | "audio" | "documents";
export type MediaStatus =
  "PENDING" | "UPLOADING" | "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | "MISSING" | "DELETED";
export type UsageKind = "MOVIE" | "EBOOK" | "AUDIOBOOK" | "BANNER" | "COLLECTION";

export interface MediaUsage {
  kind: UsageKind;
  role: string;
  title: string;
  code: string | null;
  slug?: string | null;
  ownerId?: string;
  href: string;
}

/** How far the server has got preparing a video for streaming; null once it is ready or failed. */
export interface ProcessingProgress {
  percent: number;
  step: string;
  startedAt: string | null;
  etaSeconds: number | null;
}

export interface MediaListItem {
  id: string;
  type: string;
  category: MediaCategory;
  status: MediaStatus;
  progress: ProcessingProgress | null;
  fileName: string | null;
  displayTitle: string | null;
  altText: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  folder: string | null;
  createdAt: string;
  uploadedBy: string | null;
  usageCount: number;
  usedBy: MediaUsage[];
  thumbnailUrl: string | null;
}

export interface MediaDetail extends Omit<MediaListItem, "usedBy" | "thumbnailUrl" | "usageCount"> {
  processingError: string | null;
  caption: string | null;
  notes: string | null;
  checksum: string | null;
  objectKey: string | null;
  updatedAt: string;
  protected: boolean;
  previewUrl: string | null;
  previewKind: "image" | "video" | "audio" | "pdf" | "file";
  previewExpiresInSeconds: number | null;
  publicUrl: string | null;
  usedBy: MediaUsage[];
  renditions: Array<{
    id: string;
    variant: string | null;
    resolution: string | null;
    status: string;
    sizeBytes: number | null;
  }>;
}

export interface MediaStats {
  total: number;
  storageBytes: number;
  byCategory: Record<MediaCategory, number>;
  bytesByCategory: Record<MediaCategory, number>;
  byStatus: Record<string, number>;
  attached: number;
  unattached: number;
}

export interface MediaListParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: MediaCategory;
  assetRole?: string;
  status?: string;
  attachedType?:
    "movies" | "ebooks" | "audiobooks" | "homepage" | "banners" | "collections" | "unattached";
  sort?: "newest" | "oldest" | "name" | "size" | "type";
}

export interface ReconcileReport {
  checked: number;
  missing: Array<{ id: string; fileName: string | null; type: string; used: boolean }>;
  orphans: Array<{ key: string; sizeBytes: number }>;
  orphanScan: { scannedKeys: number; truncated: boolean };
  failed: number;
  stuckUploads: number;
}

const qs = (p: Record<string, unknown>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p))
    if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
};

export interface MediaMetadataPatch {
  displayTitle?: string | null;
  altText?: string | null;
  caption?: string | null;
  notes?: string | null;
  folder?: string | null;
}

export const mediaLibraryApi = {
  list: (p: MediaListParams) =>
    api.get<{ data: MediaListItem[]; meta?: ApiMeta }>(`/admin/media${qs({ ...p })}`),
  stats: () => api.get<{ data: MediaStats }>("/admin/media/stats"),
  detail: (id: string) => api.get<{ data: MediaDetail }>(`/admin/media/${id}`),
  update: (id: string, patch: MediaMetadataPatch) =>
    api.patch<{ data: MediaDetail }>(`/admin/media/${id}`, patch),
  remove: (id: string) => api.delete<{ data: null }>(`/admin/media/${id}`),
  bulkDelete: (ids: string[]) =>
    api.post<{
      data: {
        results: Array<{ id: string; deleted: boolean; reason?: string }>;
        deleted: number;
        blocked: number;
      };
    }>("/admin/media/bulk-delete", { ids }),
  replace: (id: string, newAssetId: string) =>
    api.post<{ data: { referencesMoved: number; asset: MediaDetail } }>(
      `/admin/media/${id}/replace`,
      { newAssetId },
    ),
  reconcile: (opts: { batch?: number; scanBucket?: boolean; scanLimit?: number } = {}) =>
    api.post<{ data: ReconcileReport }>("/admin/media/reconcile", opts),
  retryProcessing: (id: string) =>
    api.post<{ data: unknown }>(`/admin/media/${id}/retry-processing`),
};

/* ---------------------------------- uploads ---------------------------------- */

export type UploadStage =
  | "queued"
  | "preparing"
  | "uploading"
  | "verifying"
  | "processing"
  | "ready"
  | "failed"
  | "cancelled";

export interface UploadHandle {
  /** resolves with the asset id once the file is READY (or rejects with a readable reason) */
  done: Promise<string>;
  cancel: () => void;
}

export interface UploadCallbacks {
  onStage: (stage: UploadStage, assetId?: string) => void;
  /** 0..1 of the bytes actually sent to storage */
  onProgress: (fraction: number) => void;
  /** how far the server has got processing the file, after the upload */
  onProcessing?: (progress: ProcessingProgress | null) => void;
}

/** The upload "purpose" for a file picked in the library: pictures are generic, everything else keeps its real role. */
export function purposeForFile(
  file: File,
): { purpose: string; mimeType: string } | { error: string } {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop() ?? "";
  const byExt: Record<string, { purpose: string; mime: string }> = {
    jpg: { purpose: "LIBRARY_IMAGE", mime: "image/jpeg" },
    jpeg: { purpose: "LIBRARY_IMAGE", mime: "image/jpeg" },
    png: { purpose: "LIBRARY_IMAGE", mime: "image/png" },
    webp: { purpose: "LIBRARY_IMAGE", mime: "image/webp" },
    mp4: { purpose: "MOVIE_MASTER", mime: "video/mp4" },
    mov: { purpose: "MOVIE_MASTER", mime: "video/quicktime" },
    mkv: { purpose: "MOVIE_MASTER", mime: "video/x-matroska" },
    mp3: { purpose: "AUDIOBOOK_FILE", mime: "audio/mpeg" },
    m4a: { purpose: "AUDIOBOOK_FILE", mime: "audio/mp4" },
    aac: { purpose: "AUDIOBOOK_FILE", mime: "audio/aac" },
    wav: { purpose: "AUDIOBOOK_FILE", mime: "audio/wav" },
    epub: { purpose: "EBOOK_EPUB", mime: "application/epub+zip" },
    pdf: { purpose: "EBOOK_PDF", mime: "application/pdf" },
    m4b: { purpose: "AUDIOBOOK_FILE", mime: "audio/mp4" },
    srt: { purpose: "CAPTION", mime: "application/x-subrip" },
    vtt: { purpose: "CAPTION", mime: "text/vtt" },
  };
  const hit = byExt[ext];
  if (!hit)
    return {
      error: `".${ext || "?"}" files are not supported. Use JPG, PNG, WebP, MP4, MOV, MKV, MP3, M4A, AAC, WAV, EPUB or PDF.`,
    };
  return { purpose: hit.purpose, mimeType: hit.mime };
}

export const MAX_BYTES: Record<string, number> = {
  LIBRARY_IMAGE: 15 * 1024 ** 2,
  MOVIE_MASTER: 30 * 1024 ** 3,
  TRAILER: 30 * 1024 ** 3,
  TEASER: 30 * 1024 ** 3,
  CAPTION: 2 * 1024 ** 2,
  AUDIO_TRACK: 2 * 1024 ** 3,
  AUDIOBOOK_PREVIEW: 2 * 1024 ** 3,
  AUDIOBOOK_CHAPTER: 2 * 1024 ** 3,
  EBOOK_SAMPLE: 200 * 1024 ** 2,
  AUDIOBOOK_FILE: 2 * 1024 ** 3,
  EBOOK_EPUB: 200 * 1024 ** 2,
  EBOOK_PDF: 200 * 1024 ** 2,
};
/** Anything above this goes through S3 multipart (resumable per part) instead of one PUT. */
export const MULTIPART_THRESHOLD = 100 * 1024 ** 2;
const PART_SIZE = 32 * 1024 ** 2;

function putWithProgress(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onBytes: (loaded: number) => void,
  signal: AbortSignal,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onBytes(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.getResponseHeader("ETag"))
        : reject(new Error(`Storage rejected the upload (HTTP ${xhr.status}).`));
    xhr.onerror = () =>
      reject(new Error("The upload could not reach storage. Check your connection and retry."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

/** Direct-to-storage upload with real byte progress, using the one existing backend upload flow (library mode). */
export function startLibraryUpload(
  file: File,
  cb: UploadCallbacks,
  /** `purpose` states what the file is FOR (e.g. TRAILER, AUDIOBOOK_CHAPTER) when the extension alone cannot tell. */
  opts: { purpose?: string } = {},
): UploadHandle {
  const ctl = new AbortController();
  let assetId: string | undefined;
  let multipart = false;

  const run = async (): Promise<string> => {
    cb.onStage("preparing");
    const kind = purposeForFile(file);
    if ("error" in kind) throw new Error(kind.error);
    if (opts.purpose) kind.purpose = opts.purpose;
    const limit = MAX_BYTES[kind.purpose];
    if (limit && file.size > limit)
      throw new Error(
        `This file is ${(file.size / 1024 ** 2).toFixed(0)} MB; the limit for this type is ${(limit / 1024 ** 2).toFixed(0)} MB.`,
      );
    if (file.size === 0) throw new Error("This file is empty.");

    const body = {
      library: true,
      purpose: kind.purpose,
      fileName: file.name,
      mimeType: kind.mimeType,
      sizeBytes: file.size,
    };
    multipart = file.size > MULTIPART_THRESHOLD;

    if (!multipart) {
      const p = (
        await api.post<{
          data: { assetId: string; uploadUrl: string; headers: Record<string, string> };
        }>("/admin/uploads/presign", body)
      ).data;
      assetId = p.assetId;
      cb.onStage("uploading", assetId);
      await putWithProgress(
        p.uploadUrl,
        p.headers,
        file,
        (n) => cb.onProgress(n / file.size),
        ctl.signal,
      );
      cb.onProgress(1);
      cb.onStage("verifying", assetId);
      await api.post(`/admin/uploads/${assetId}/complete`);
    } else {
      const init = (
        await api.post<{ data: { assetId: string } }>("/admin/uploads/multipart/initiate", body)
      ).data;
      assetId = init.assetId;
      cb.onStage("uploading", assetId);
      const parts: Array<{ partNumber: number; etag?: string }> = [];
      let sent = 0;
      for (let n = 1, off = 0; off < file.size; n++, off += PART_SIZE) {
        const chunk = file.slice(off, Math.min(file.size, off + PART_SIZE));
        const signed = (
          await api.post<{ data: { url: string } }>(`/admin/uploads/multipart/${assetId}/part`, {
            partNumber: n,
          })
        ).data;
        const etag = await putWithProgress(
          signed.url,
          {},
          chunk,
          (loaded) => cb.onProgress((sent + loaded) / file.size),
          ctl.signal,
        );
        sent += chunk.size;
        // the browser can only read the ETag when the bucket CORS exposes it; if not, the server asks storage for it
        parts.push(etag ? { partNumber: n, etag } : { partNumber: n });
      }
      cb.onProgress(1);
      cb.onStage("verifying", assetId);
      await api.post(`/admin/uploads/multipart/${assetId}/complete`, { parts });
    }

    // images/ebooks are READY right after verification; video and audio go through the processing worker.
    // A big video can take hours, so the wait only gives up when the server has reported no change for 15 minutes.
    let seen = "";
    for (let quiet = 0; quiet < 600; quiet++) {
      if (ctl.signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
      const st = (
        await api.get<{
          data: {
            status: MediaStatus;
            processingError: string | null;
            progress?: ProcessingProgress | null;
          };
        }>(`/admin/uploads/${assetId}/status`)
      ).data;
      if (st.status === "READY") return assetId!;
      if (st.status === "FAILED") throw new Error(st.processingError || "Processing failed.");
      cb.onStage("processing", assetId);
      cb.onProcessing?.(st.progress ?? null);
      const now = `${st.status}|${st.progress?.percent}|${st.progress?.step}`;
      if (now !== seen) quiet = 0;
      seen = now;
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error(
      "Processing has not moved for 15 minutes. Check this file in the Media Library.",
    );
  };

  const done = run()
    .then((id) => {
      cb.onStage("ready", id);
      return id;
    })
    .catch(async (err) => {
      const cancelled = err instanceof DOMException && err.name === "AbortError";
      // an unfinished upload must not linger as a ghost row
      if (assetId && cancelled) {
        await (
          multipart
            ? api.delete(`/admin/uploads/multipart/${assetId}`)
            : api.post(`/admin/uploads/${assetId}/abort`)
        ).catch(() => undefined);
      }
      cb.onStage(cancelled ? "cancelled" : "failed", assetId);
      throw cancelled ? new Error("Upload cancelled.") : err;
    });

  return { done, cancel: () => ctl.abort() };
}
