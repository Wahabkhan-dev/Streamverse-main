import type { ContentType } from "@prisma/client";
import * as movieRepository from "../repositories/movie.repository";
import * as ebookRepository from "../repositories/ebook.repository";
import * as audiobookRepository from "../repositories/audiobook.repository";
import type { FieldError } from "../utils/errors";
import { NotFoundError, ValidationError } from "../utils/errors";

/**
 * Centralized publish-readiness rules (Section 16) — nowhere else decides whether a title is "ready".
 * Field errors use the same `{ path, message }` shape as every other validation error in this API (the
 * spec's example response uses `field`; this API has one consistent error shape everywhere, so the key
 * here is `path`, same as a Zod validation error — see README).
 */
const req = (ok: unknown, path: string, message: string): FieldError | null => (ok ? null : { path, message });

function sharedChecks(content: { title: string; summary: string | null; description: string | null; ageRestricted: boolean; minimumAge: number | null }, genreCount: number, primaryLanguageCount: number): FieldError[] {
  return [
    req(content.title.trim().length > 0, "title", "Title is required."),
    req(!!content.summary, "summary", "Summary is required."),
    req(!!content.description, "description", "Description is required."),
    req(genreCount > 0, "genreIds", "At least one genre is required."),
    req(primaryLanguageCount > 0, "languages", "A primary language is required."),
    req(!content.ageRestricted || content.minimumAge !== null, "age.minimumAge", "A minimum age is required because this title is age-restricted."),
  ].filter((e): e is FieldError => e !== null);
}

/** Section 5/70: a database id existing is not the same as the file being ready — require READY, not merely set. */
const isReady = (asset: { status: string } | null | undefined) => asset?.status === "READY";

async function validateMovie(contentId: string): Promise<FieldError[]> {
  const full = await movieRepository.findFullByContentId(contentId);
  if (!full) throw new NotFoundError("Movie not found");
  const primaryLanguages = full.content.languages.filter((l) => l.role === "PRIMARY").length;
  return [
    ...sharedChecks(full.content, full.content.genres.length, primaryLanguages),
    req(full.content.releaseDate !== null, "releaseDate", "Release date is required."),
    req(full.runtimeMinutes !== null, "movie.runtimeMinutes", "Runtime is required."),
    req(!!full.masterAssetId, "movie.masterAssetId", "The main movie file is required."),
    req(isReady(full.masterAsset), "movie.masterAssetId", "The main movie file has not finished processing yet."),
    req(!!full.posterAssetId, "movie.posterAssetId", "Poster is required."),
    req(isReady(full.posterAsset), "movie.posterAssetId", "Poster has not finished processing yet."),
    req(!!full.backdropAssetId, "movie.backdropAssetId", "Backdrop is required."),
    req(isReady(full.backdropAsset), "movie.backdropAssetId", "Backdrop has not finished processing yet."),
    req(!!full.thumbnailAssetId, "movie.thumbnailAssetId", "Thumbnail is required."),
    req(isReady(full.thumbnailAsset), "movie.thumbnailAssetId", "Thumbnail has not finished processing yet."),
    req(!!full.content.ageRating, "age.ageRating", "Age rating is required."),
  ].filter((e): e is FieldError => e !== null);
}

async function validateEbook(contentId: string): Promise<FieldError[]> {
  const full = await ebookRepository.findFullByContentId(contentId);
  if (!full) throw new NotFoundError("eBook not found");
  const primaryLanguages = full.content.languages.filter((l) => l.role === "PRIMARY").length;
  const hasReadableFile = isReady(full.epubAsset) || isReady(full.pdfAsset);
  return [
    ...sharedChecks(full.content, full.content.genres.length, primaryLanguages),
    req(!!full.author, "ebook.author", "Author is required."),
    req(!!full.epubAssetId || !!full.pdfAssetId, "ebook.epubAssetId", "At least one EPUB or PDF file is required."),
    req(hasReadableFile, "ebook.epubAssetId", "The EPUB/PDF file has not finished processing yet."),
    req(!full.flipbookEnabled || isReady(full.pdfAsset), "ebook.flipbookEnabled", "A flipbook is made from the PDF: upload a PDF and wait for it to finish processing, or turn the flipbook off."),
    req(!!full.frontCoverAssetId, "ebook.frontCoverAssetId", "Front cover is required."),
    req(isReady(full.frontCoverAsset), "ebook.frontCoverAssetId", "Front cover has not finished processing yet."),
    req(!!full.thumbnailAssetId, "ebook.thumbnailAssetId", "Thumbnail is required."),
    req(isReady(full.thumbnailAsset), "ebook.thumbnailAssetId", "Thumbnail has not finished processing yet."),
    // Deliberately NOT required (Section 18): isbn, backCoverAssetId, spineAssetId, fullWrapAssetId.
  ].filter((e): e is FieldError => e !== null);
}

async function validateAudiobook(contentId: string): Promise<FieldError[]> {
  const full = await audiobookRepository.findFullByContentId(contentId);
  if (!full) throw new NotFoundError("Audiobook not found");
  const primaryLanguages = full.content.languages.filter((l) => l.role === "PRIMARY").length;
  const errors = [
    ...sharedChecks(full.content, full.content.genres.length, primaryLanguages),
    req(!!full.author, "audiobook.author", "Author is required."),
    req(!!full.narrator, "audiobook.narrator", "Narrator is required."),
    req(!!full.coverAssetId, "audiobook.coverAssetId", "Cover is required."),
    req(isReady(full.coverAsset), "audiobook.coverAssetId", "Cover has not finished processing yet."),
    req(!!full.thumbnailAssetId, "audiobook.thumbnailAssetId", "Thumbnail is required."),
    req(isReady(full.thumbnailAsset), "audiobook.thumbnailAssetId", "Thumbnail has not finished processing yet."),
  ];
  if (full.deliveryMode === "CHAPTER_FILES") {
    errors.push(req(full.chapters.some((c) => !!c.audioAssetId), "chapters", "At least one chapter with an audio file is required."));
    errors.push(req(full.chapters.some((c) => isReady(c.audioAsset)), "chapters", "At least one chapter's audio file has not finished processing yet."));
  } else {
    errors.push(req(!!full.mainAssetId, "audiobook.mainAssetId", "The main audio file is required."));
    errors.push(req(isReady(full.mainAsset), "audiobook.mainAssetId", "The main audio file has not finished processing yet."));
  }
  return errors.filter((e): e is FieldError => e !== null);
}

export async function validateReadiness(type: ContentType, contentId: string): Promise<FieldError[]> {
  const errors = type === "MOVIE" ? await validateMovie(contentId) : type === "EBOOK" ? await validateEbook(contentId) : await validateAudiobook(contentId);
  // one problem per field: a missing file is "required", never also "has not finished processing"
  return errors.filter((e, i) => errors.findIndex((x) => x.path === e.path) === i);
}

/** Throws a ValidationError (400) carrying every problem at once, rather than one generic message. */
export async function assertReadyToPublish(type: ContentType, contentId: string): Promise<void> {
  const errors = await validateReadiness(type, contentId);
  if (errors.length) throw new ValidationError(errors, "Content is not ready to publish");
}
