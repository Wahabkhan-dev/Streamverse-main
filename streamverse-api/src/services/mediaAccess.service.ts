import { logger } from "../config/logger";
import { env } from "../config/env";
import * as mediaAccessRepository from "../repositories/mediaAccess.repository";
import { NotFoundError } from "../utils/errors";
import { checkAccess, type AccessContext } from "./entitlement/entitlement.service";
import { getStorageProvider } from "./storage";

/**
 * Phase 6 (Section 53-56) foundation, now backed by Phase 8's central entitlement service.
 * `checkAccess(context, contentId, type)` is the ONLY thing that decides what a user may consume —
 * no ad-hoc checks live here.
 *
 * Responses never include a `storageKey`, a bucket credential, or a permanent URL (Section 54) — only a
 * short-lived signed URL (`DOWNLOAD_URL_TTL_SECONDS`, default 10 minutes) or nothing at all.
 */

async function signedUrlFor(key: string, contentType?: string) {
  const url = await getStorageProvider().createDownloadUrl(key, env.DOWNLOAD_URL_TTL_SECONDS, contentType);
  return { url, expiresAt: new Date(Date.now() + env.DOWNLOAD_URL_TTL_SECONDS * 1000).toISOString() };
}

export async function getMoviePlayback(contentId: string, context: AccessContext) {
  const decision = await checkAccess(context, contentId, "movie");
  // Section 67: existence of hidden/removed content is never confirmed either way → 404
  if (!decision.canViewMetadata) throw new NotFoundError("Movie not found");

  const row = await mediaAccessRepository.findMovieForPlayback(contentId);
  if (!row) throw new NotFoundError("Movie not found");

  const mediaReady = row.masterAsset?.status === "READY" && !!row.masterAsset.hlsManifestKey;
  if (!decision.canConsume || !mediaReady) return { access: decision, mediaReady, playback: null };

  const playback = await signedUrlFor(row.masterAsset!.hlsManifestKey!, "application/vnd.apple.mpegurl");
  return { access: decision, mediaReady, playback };
}

export async function getEbookAccess(contentId: string, context: AccessContext) {
  const decision = await checkAccess(context, contentId, "ebook");
  if (!decision.canViewMetadata) throw new NotFoundError("eBook not found");

  const row = await mediaAccessRepository.findEbookForAccess(contentId);
  if (!row) throw new NotFoundError("eBook not found");

  const file =
    row.epubAsset?.status === "READY"
      ? { asset: row.epubAsset, contentType: "application/epub+zip" }
      : row.pdfAsset?.status === "READY"
        ? { asset: row.pdfAsset, contentType: "application/pdf" }
        : null;
  const mediaReady = !!file;
  if (!decision.canConsume || !mediaReady) return { access: decision, mediaReady, access_url: null };

  if (!file!.asset.storageKey) {
    logger.warn({ contentId }, "mediaAccess: READY ebook asset has null storageKey");
    return { access: decision, mediaReady: false, access_url: null };
  }
  const playback = await signedUrlFor(file!.asset.storageKey, file!.contentType);
  return { access: decision, mediaReady, access_url: playback };
}

export async function getAudiobookPlayback(contentId: string, context: AccessContext) {
  const decision = await checkAccess(context, contentId, "audiobook");
  if (!decision.canViewMetadata) throw new NotFoundError("Audiobook not found");

  const row = await mediaAccessRepository.findAudiobookForPlayback(contentId);
  if (!row) throw new NotFoundError("Audiobook not found");

  if (!decision.canConsume) return { access: decision, mediaReady: false, playback: null };

  if (row.deliveryMode === "CHAPTER_FILES") {
    const readyChapters = row.chapters.filter((c) => c.audioAsset?.status === "READY");
    if (readyChapters.length === 0) return { access: decision, mediaReady: false, playback: null };
    const chapters = await Promise.all(
      readyChapters.map(async (c) => {
        if (!c.audioAsset?.storageKey) {
          logger.warn({ contentId, chapterId: c.id }, "mediaAccess: READY chapter asset has null storageKey");
          return null;
        }
        return {
          chapterId: c.id,
          chapterNumber: c.chapterNumber,
          title: c.title,
          ...(await signedUrlFor(c.audioAsset.storageKey, "audio/mpeg")),
        };
      }),
    ).then((cs) => cs.filter((c): c is NonNullable<typeof c> => c !== null));
    return { access: decision, mediaReady: true, playback: { mode: "CHAPTER_FILES" as const, chapters } };
  }

  const mediaReady = row.mainAsset?.status === "READY";
  if (!mediaReady) return { access: decision, mediaReady: false, playback: null };
  if (!row.mainAsset?.storageKey) {
    logger.warn({ contentId }, "mediaAccess: READY audiobook main asset has null storageKey");
    return { access: decision, mediaReady: false, playback: null };
  }
  const main = await signedUrlFor(row.mainAsset.storageKey, "audio/mpeg");
  return { access: decision, mediaReady: true, playback: { mode: "SINGLE_FILE" as const, ...main } };
}
