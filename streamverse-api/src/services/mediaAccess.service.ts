import { logger } from "../config/logger";
import { env } from "../config/env";
import * as mediaAccessRepository from "../repositories/mediaAccess.repository";
import * as progressRepository from "../repositories/progress.repository";
import { NotFoundError } from "../utils/errors";
import { checkAccess, type AccessContext } from "./entitlement/entitlement.service";
import { getStorageProvider } from "./storage";
import { signHlsToken } from "./media/hlsDelivery.service";
import type { EbookAccessResponse } from "../types/mediaAccess.types";

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

/** `apiBase` is the public API origin + prefix, e.g. https://api.example.com/api/v1 — playlists are served from it. */
export async function getMoviePlayback(contentId: string, context: AccessContext, apiBase: string) {
  const decision = await checkAccess(context, contentId, "movie");
  // Section 67: existence of hidden/removed content is never confirmed either way → 404
  if (!decision.canViewMetadata) throw new NotFoundError("Movie not found");

  const row = await mediaAccessRepository.findMovieForPlayback(contentId);
  if (!row) throw new NotFoundError("Movie not found");

  const mediaReady = row.masterAsset?.status === "READY" && !!row.masterAsset.hlsManifestKey;
  if (!decision.canConsume || !mediaReady) return { access: decision, mediaReady, playback: null };

  // The manifest alone is not enough (its variant playlists/segments are separate private objects), so the client
  // gets the URL of a backend-served, per-object-signed master playlist, authorised by a short-lived token.
  const { token, expiresAt } = signHlsToken(context.userId!, contentId);
  const playback = { type: "HLS" as const, url: `${apiBase}/media/hls/${contentId}/master.m3u8?t=${encodeURIComponent(token)}`, expiresAt };
  // where this user left off, so playback resumes on any device (not just the browser that saved it)
  const saved = await progressRepository.findMovieProgress(context.userId!, contentId);
  // stopped in the last few seconds (the credits) counts as finished: the movie starts again from the beginning
  const nearEnd = !!saved?.durationSeconds && saved.positionSeconds >= saved.durationSeconds - Math.max(3, saved.durationSeconds * 0.05);
  const progress = saved && !saved.completed && !nearEnd ? { positionSeconds: saved.positionSeconds } : null;
  return { access: decision, mediaReady, playback, progress };
}

/**
 * The trailer or teaser of a movie. Anyone who may see the movie's page may watch it (no plan needed); a title that has none
 * answers 404, so the page never offers one the admin did not add.
 */
export async function getMovieTrailer(contentId: string, context: AccessContext, variant: "trailer" | "teaser") {
  const decision = await checkAccess(context, contentId, "movie");
  if (!decision.canViewMetadata) throw new NotFoundError("Movie not found");
  const row = await mediaAccessRepository.findMovieForPlayback(contentId);
  const asset = variant === "trailer" ? row?.trailerAsset : row?.teaserAsset;
  if (!row || !asset || asset.status !== "READY" || !asset.storageKey) throw new NotFoundError(`This movie has no ${variant}.`);
  const { url, expiresAt } = await signedUrlFor(asset.storageKey, asset.mimeType ?? "video/mp4");
  return { variant, url, expiresAt };
}

/**
 * `format: "pdf"` asks for the PDF of a book that offers a flipbook (the page-turn view is built from it); without it the EPUB
 * is preferred, as before.
 */
export async function getEbookAccess(contentId: string, context: AccessContext, format?: "pdf") {
  const decision = await checkAccess(context, contentId, "ebook");
  if (!decision.canViewMetadata) throw new NotFoundError("eBook not found");

  const row = await mediaAccessRepository.findEbookForAccess(contentId);
  if (!row) throw new NotFoundError("eBook not found");

  if (format === "pdf" && (!row.flipbookEnabled || row.pdfAsset?.status !== "READY")) throw new NotFoundError("This eBook has no flipbook version.");
  const file =
    format === "pdf"
      ? { asset: row.pdfAsset!, contentType: "application/pdf", fileType: "pdf" as const }
      : row.epubAsset?.status === "READY"
      ? { asset: row.epubAsset, contentType: "application/epub+zip", fileType: "epub" as const }
      : row.pdfAsset?.status === "READY"
        ? { asset: row.pdfAsset, contentType: "application/pdf", fileType: "pdf" as const }
        : null;
  const mediaReady = !!file;

  const base = {
    access: decision,
    mediaReady,
    contentId,
    signedUrl: null as string | null,
    fileType: null as "epub" | "pdf" | null,
    expiresAt: null as string | null,
    progress: null as { location: string | null; page: number | null; pct: number } | null,
  } satisfies { access: typeof decision; mediaReady: boolean } & EbookAccessResponse;

  if (!decision.canConsume || !mediaReady) return base;

  if (!file!.asset.storageKey) {
    logger.warn({ contentId }, "mediaAccess: READY ebook asset has null storageKey");
    return { ...base, mediaReady: false };
  }

  const { url, expiresAt } = await signedUrlFor(file!.asset.storageKey, file!.contentType);

  // Fetch reading progress when the user is authenticated
  let progress: { location: string | null; page: number | null; pct: number } | null = null;
  if (context.userId) {
    const progressRecord = await progressRepository.findEbookProgress(context.userId, contentId);
    if (progressRecord) {
      progress = { location: progressRecord.location ?? null, page: progressRecord.page ?? null, pct: progressRecord.percentage };
    }
  }

  return {
    ...base,
    signedUrl: url,
    fileType: file!.fileType,
    expiresAt,
    progress,
  };
}

async function audiobookResume(context: AccessContext, contentId: string) {
  const saved = await progressRepository.findAudiobookProgress(context.userId!, contentId);
  return saved && !saved.completed ? { positionSeconds: saved.positionSeconds, chapterId: saved.chapterId ?? null } : null;
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
    return { access: decision, mediaReady: true, playback: { mode: "CHAPTER_FILES" as const, chapters }, progress: await audiobookResume(context, contentId) };
  }

  const mediaReady = row.mainAsset?.status === "READY";
  if (!mediaReady) return { access: decision, mediaReady: false, playback: null };
  if (!row.mainAsset?.storageKey) {
    logger.warn({ contentId }, "mediaAccess: READY audiobook main asset has null storageKey");
    return { access: decision, mediaReady: false, playback: null };
  }
  const main = await signedUrlFor(row.mainAsset.storageKey, "audio/mpeg");
  return { access: decision, mediaReady: true, playback: { mode: "SINGLE_FILE" as const, ...main }, progress: await audiobookResume(context, contentId) };
}
