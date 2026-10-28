import { getAccessToken, isApiError } from "@/api/client";
import { catalogApi } from "@/api/catalog.api";
import { mediaApi } from "@/api/media.api";
import type { ApiOfflineAuthorization, ApiOfflineFile } from "@/api/types";
import { getAuthUser } from "@/lib/authState";
import { API_BASE } from "@/lib/config";
import { hasFile, keepPages, offlineUrl, removeAllFiles, removeFiles, removePages, storeResponse, storeText } from "./files";
import { allRecords, clearRecords, deleteRecord, getRecord, isUsable, patchRecord, putRecord, type DownloadRecord, type OfflinePlayback } from "./store";

/** Why a download did not happen, in words for the customer. */
export class DownloadError extends Error {}

const CONCURRENCY = 4;
/** a segment's size is unknown up front; this only shapes the progress bar until it finishes */
const GUESSED_BYTES = 2_000_000;

const active = new Map<string, AbortController>();
export const isDownloading = (contentId: string) => active.has(contentId);

type Kind = DownloadRecord["type"];
const LIST_PATH: Record<Kind, string> = { MOVIE: "movies", EBOOK: "ebooks", AUDIOBOOK: "audiobooks" };
const PLAY_PATH: Record<Kind, string> = { MOVIE: "watch", EBOOK: "read", AUDIOBOOK: "listen" };
export const pagesOf = (type: Kind, slug: string) => ["/downloads", `/${LIST_PATH[type]}/${slug}`, `/${PLAY_PATH[type]}/${slug}`];

const DENIED: Record<string, string> = {
  SUBSCRIPTION_REQUIRED: "A subscription is required to download this title.",
  SUBSCRIPTION_INACTIVE: "Your subscription is not active, so this title cannot be downloaded.",
  AGE_RESTRICTED: "This title is age restricted and cannot be downloaded.",
  ACCOUNT_SUSPENDED: "Your account cannot download right now.",
};

async function fetchDetail(type: Kind, slug: string): Promise<unknown> {
  const res = type === "MOVIE" ? await catalogApi.getMovie(slug) : type === "EBOOK" ? await catalogApi.getEbook(slug) : await catalogApi.getAudiobook(slug);
  return res.data;
}

/** The title's own detail payload with its (expiring, online-only) picture links swapped for the saved cover. */
function localMeta(meta: unknown, poster: string | null): unknown {
  if (!poster || !meta || typeof meta !== "object") return meta;
  const out: Record<string, unknown> = { ...(meta as Record<string, unknown>) };
  for (const key of ["image", "backdropImage", "thumbnail", "cover", "poster"]) if (key in out) out[key] = poster;
  return out;
}

function playbackOf(files: ApiOfflineFile[], hasPlaylist: boolean): OfflinePlayback {
  if (hasPlaylist) return { kind: "movie", playlist: "index.m3u8" };
  const ebook = files.find((f) => f.role === "ebook");
  if (ebook) return { kind: "ebook", file: ebook.name, fileType: ebook.name.endsWith(".pdf") ? "pdf" : "epub" };
  const chapters = files.filter((f) => f.role === "chapter").sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
  if (chapters.length) return { kind: "audiobook-chapters", chapters: chapters.map((c) => ({ chapterNumber: c.chapterNumber ?? 0, title: c.chapterTitle ?? "", file: c.name })) };
  const audio = files.find((f) => f.role === "audio");
  if (audio) return { kind: "audiobook-single", file: audio.name };
  throw new DownloadError("This title has nothing to download yet.");
}

async function runPool<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failure: unknown;
  const worker = async () => {
    while (next < items.length && !failure) {
      const item = items[next++]!;
      try {
        await work(item);
      } catch (e) {
        failure = e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw failure;
}

const friendly = (e: unknown): string => {
  if (e instanceof DownloadError) return e.message;
  if (e instanceof DOMException && e.name === "AbortError") return "Download cancelled.";
  if (e instanceof DOMException && e.name === "QuotaExceededError") return "There is not enough free space on this device. Remove a download and try again.";
  if (isApiError(e)) return e.message;
  return "The download was interrupted. Check your connection and try again; it picks up where it stopped.";
};

/** Saves a title for offline use. Safe to call again after an interruption: files that arrived are kept. */
export async function startDownload(item: { contentId: string; slug: string; type: Kind }): Promise<void> {
  const user = getAuthUser();
  if (!user) throw new DownloadError("Sign in to download.");
  if (!navigator.onLine) throw new DownloadError("You need an internet connection to start a download.");
  if (active.has(item.contentId)) return;
  const controller = new AbortController();
  active.set(item.contentId, controller);
  try {
    void navigator.storage?.persist?.(); // asks the browser not to clear downloads when space runs low
    const [meta, auth] = await Promise.all([fetchDetail(item.type, item.slug), mediaApi.authorizeOffline(item.contentId).then((r) => r.data as ApiOfflineAuthorization)]);
    const dl = auth.download;
    if (!dl) throw new DownloadError(auth.mediaReady ? (DENIED[auth.access.reason ?? ""] ?? "This title cannot be downloaded with your current plan.") : "This title is not ready to download yet.");

    const poster = dl.files.find((f) => f.role === "poster");
    const posterUrl = poster ? offlineUrl(item.contentId, poster.name) : null;
    const playback = playbackOf(dl.files, !!dl.playlist);
    const prior = getRecord(item.contentId);
    putRecord({
      contentId: item.contentId,
      slug: item.slug,
      type: item.type,
      title: dl.title,
      userId: user.id,
      status: "downloading",
      progress: prior?.progress ?? 0,
      bytes: prior?.bytes ?? 0,
      downloadedAt: new Date().toISOString(),
      expiresAt: dl.expiresAt,
      meta: localMeta(meta, posterUrl),
      posterUrl,
      playback,
    });

    if (dl.playlist) await storeText(item.contentId, dl.playlist.name, dl.playlist.text, "application/vnd.apple.mpegurl");

    const todo: ApiOfflineFile[] = [];
    let weightDone = 0;
    const weightOf = (f: ApiOfflineFile) => f.bytes ?? GUESSED_BYTES;
    const weightTotal = dl.files.reduce((n, f) => n + weightOf(f), 0);
    for (const f of dl.files) {
      if (await hasFile(item.contentId, f.name)) weightDone += weightOf(f);
      else todo.push(f);
    }
    let bytes = prior?.bytes ?? 0;
    let streaming = 0;
    let lastPush = 0;
    const push = (force = false) => {
      const now = Date.now();
      if (!force && now - lastPush < 400) return;
      lastPush = now;
      patchRecord(item.contentId, { progress: Math.min(0.99, (weightDone + streaming) / Math.max(1, weightTotal)), bytes });
    };
    push(true);

    const token = encodeURIComponent(dl.token);
    await runPool(todo, CONCURRENCY, async (f) => {
      const res = await fetch(`${API_BASE}/media/offline-file/${item.contentId}?f=${encodeURIComponent(f.id)}&t=${token}`, { signal: controller.signal });
      if (!res.ok) throw new DownloadError(res.status === 401 ? "The download permission expired. Please try again." : "A file could not be downloaded. Please try again.");
      let mine = 0;
      await storeResponse(item.contentId, f.name, res, f.mime, (n) => {
        mine += n;
        streaming += n;
        bytes += n;
        push();
      });
      streaming -= mine;
      weightDone += weightOf(f);
    });

    patchRecord(item.contentId, { status: "ready", progress: 1, bytes, expiresAt: dl.expiresAt, downloadedAt: new Date().toISOString() });
    await keepPages(pagesOf(item.type, item.slug));
  } catch (e) {
    if (controller.signal.aborted) return; // cancelled on purpose: the record is already gone
    if (getRecord(item.contentId)) patchRecord(item.contentId, { status: "partial", error: friendly(e) });
    throw new DownloadError(friendly(e));
  } finally {
    active.delete(item.contentId);
  }
}

/** Stops a download in progress and removes what had arrived. */
export async function cancelDownload(contentId: string): Promise<void> {
  await removeDownload(contentId);
}

export async function removeDownload(contentId: string): Promise<void> {
  const rec = getRecord(contentId);
  active.get(contentId)?.abort();
  deleteRecord(contentId);
  await removeFiles(contentId);
  if (rec) await removePages([`/${LIST_PATH[rec.type]}/${rec.slug}`, `/${PLAY_PATH[rec.type]}/${rec.slug}`]);
}

/** Signing out (or another customer signing in) leaves nothing of the previous customer on the device. */
export async function removeAllDownloads(): Promise<void> {
  for (const c of active.values()) c.abort();
  active.clear();
  clearRecords();
  await removeAllFiles();
  await removePages(["/downloads"]);
}

/** While online: every download of this customer is renewed if they are still entitled, and deleted if not. */
export async function renewDownloads(): Promise<void> {
  const user = getAuthUser();
  if (!user || !navigator.onLine || !getAccessToken()) return;
  for (const r of allRecords()) {
    if (r.userId !== user.id) {
      await removeDownload(r.contentId); // left by someone else
      continue;
    }
    if (r.status !== "ready") continue;
    try {
      const { data } = await mediaApi.renewOffline(r.contentId);
      if (data.entitled && data.expiresAt) patchRecord(r.contentId, { expiresAt: data.expiresAt });
      else await removeDownload(r.contentId);
    } catch (e) {
      // a 404 means the title left the catalogue; anything else (network, server) keeps the copy as it is
      if (isApiError(e) && e.status === 404) await removeDownload(r.contentId);
    }
  }
}

export { isUsable };
