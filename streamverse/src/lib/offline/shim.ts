import { ApiError, isApiError } from "@/api/client";
import type { ApiEbookAccess, ApiMoviePlaybackAccess, ApiPlaybackAccess, ApiResponse } from "@/api/types";
import { getAuthUser } from "@/lib/authState";
import { offlineUrl } from "./files";
import { findByIdOrSlug, isUsable, type DownloadRecord } from "./store";

/**
 * The answer to "play / read / open this title" when it cannot come from the server: the same shapes the API returns, but
 * pointing at the copy saved on this device. The players and pages call the normal API functions and never know the
 * difference; only a title this customer downloaded (and whose download has not expired) is ever answered locally.
 */

const wrap = <T>(data: T): ApiResponse<T> => ({ success: true, message: "From this device", data }) as unknown as ApiResponse<T>;

/** No answer from the server at all (or a gateway saying it is down), as opposed to the server refusing the request. */
export const isUnreachable = (e: unknown) => e instanceof TypeError || (isApiError(e) && e.status >= 502 && e.status <= 504);

export function copyOnDevice(idOrSlug: string): DownloadRecord | undefined {
  const rec = findByIdOrSlug(idOrSlug);
  if (!rec || rec.status !== "ready") return undefined;
  return rec.userId === getAuthUser()?.id ? rec : undefined;
}

/**
 * Online -> the server answers. No internet, or the server cannot be reached -> the saved copy answers (if there is a valid
 * one). An expired copy says so, so the screen can ask the customer to reconnect and renew it.
 */
export async function withLocalCopy<T>(idOrSlug: string, fromServer: () => Promise<T>, fromDevice: (r: DownloadRecord) => T): Promise<T> {
  const rec = copyOnDevice(idOrSlug);
  const use = () => {
    if (!isUsable(rec, getAuthUser()?.id)) throw new ApiError(403, "DOWNLOAD_EXPIRED", "This download has expired. Connect to the internet to renew it.");
    return fromDevice(rec);
  };
  if (rec && !navigator.onLine) return use();
  try {
    return await fromServer();
  } catch (e) {
    if (rec && isUnreachable(e)) return use();
    throw e;
  }
}

export const movieAccess = (r: DownloadRecord): ApiResponse<ApiMoviePlaybackAccess> => {
  if (r.playback.kind !== "movie") throw new ApiError(404, "NOT_FOUND", "This download is not a movie.");
  return wrap({ mediaReady: true, playback: { type: "HLS", url: offlineUrl(r.contentId, r.playback.playlist), expiresAt: r.expiresAt }, progress: null });
};

export const audiobookAccess = (r: DownloadRecord): ApiResponse<ApiPlaybackAccess> => {
  const p = r.playback;
  if (p.kind === "audiobook-single") return wrap({ mediaReady: true, playback: { mode: "SINGLE_FILE", url: offlineUrl(r.contentId, p.file), expiresAt: r.expiresAt }, progress: null });
  if (p.kind === "audiobook-chapters")
    return wrap({
      mediaReady: true,
      playback: { mode: "CHAPTER_FILES", chapters: p.chapters.map((c) => ({ chapterId: `${r.contentId}:${c.chapterNumber}`, chapterNumber: c.chapterNumber, title: c.title, url: offlineUrl(r.contentId, c.file), expiresAt: r.expiresAt })) },
      progress: null,
    });
  throw new ApiError(404, "NOT_FOUND", "This download is not an audiobook.");
};

export const ebookAccess = (r: DownloadRecord): ApiResponse<ApiEbookAccess> => {
  if (r.playback.kind !== "ebook") throw new ApiError(404, "NOT_FOUND", "This download is not an eBook.");
  return wrap({ mediaReady: true, signedUrl: offlineUrl(r.contentId, r.playback.file), fileType: r.playback.fileType, contentId: r.contentId, expiresAt: r.expiresAt, progress: null });
};

/** A title's detail payload, as saved when it was downloaded. */
export const detailOf = <T>(r: DownloadRecord): ApiResponse<T> => wrap(r.meta as T);
