import type { ContentType, MediaAssetType } from "@prisma/client";

/**
 * Phase 6 (Section 7): the "upload purpose" a client names when presigning IS `MediaAssetType` — Phase
 * 3/4 already established that enum as the one per-slot kind of media ("one MediaAsset.type per named
 * slot like Movie.posterAssetId"), so introducing a second, overlapping "purpose" enum would just create
 * two sources of truth for the same idea. Every purpose below is a real `MediaAssetType` value; nothing
 * accepts an arbitrary string.
 */
export type UploadPurpose = MediaAssetType;

export const KIND = { IMAGE: "IMAGE", VIDEO: "VIDEO", AUDIO: "AUDIO", EBOOK: "EBOOK", CAPTION: "CAPTION" } as const;
export type UploadKind = (typeof KIND)[keyof typeof KIND];

const MB = 1024 * 1024;

/** Section 14: one central table of size limits, by kind — never re-declared per controller. */
export const SIZE_LIMITS_BYTES: Record<UploadKind, number> = {
  [KIND.IMAGE]: 15 * MB,
  [KIND.VIDEO]: 30 * 1024 * MB, // 30 GB — a movie master
  [KIND.AUDIO]: 2 * 1024 * MB, // 2 GB — a long single-file audiobook
  [KIND.EBOOK]: 200 * MB,
  [KIND.CAPTION]: 2 * MB,
};

/** Section 15: MIME allowlist per kind. The client's declared `mimeType` must appear here; Section 16's
 * magic-byte sniff then checks the file actually is what it claims after upload. */
export const ALLOWED_MIME_TYPES: Record<UploadKind, string[]> = {
  [KIND.IMAGE]: ["image/jpeg", "image/png", "image/webp"], // Section 77: SVG deliberately excluded (XSS risk)
  [KIND.VIDEO]: ["video/mp4", "video/quicktime", "video/x-matroska"],
  [KIND.AUDIO]: ["audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav"],
  [KIND.EBOOK]: ["application/pdf", "application/epub+zip"],
  [KIND.CAPTION]: ["text/vtt", "application/x-subrip", "text/plain"],
};

const MIN_IMAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  POSTER: { width: 500, height: 750 },
  BACKDROP: { width: 1280, height: 720 },
  THUMBNAIL: { width: 320, height: 180 },
  NORMAL_BANNER: { width: 1200, height: 400 },
  HERO_BANNER: { width: 1920, height: 800 },
  LATEST_RELEASE_BANNER: { width: 1200, height: 400 },
  MOBILE_BANNER: { width: 750, height: 1000 },
  EBOOK_FRONT_COVER: { width: 400, height: 600 },
  EBOOK_BACK_COVER: { width: 400, height: 600 },
  EBOOK_SPINE: { width: 60, height: 600 },
  EBOOK_FULL_WRAP: { width: 1200, height: 800 },
  AUDIOBOOK_COVER: { width: 500, height: 500 },
  NARRATOR_IMAGE: { width: 200, height: 200 },
};

/** One purpose → one kind, and (for content-bearing purposes) which ContentType it's valid for. Nothing
 * outside this table decides what a purpose means (Section 7/19). */
export interface PurposeRule {
  kind: UploadKind;
  contentTypes: ContentType[] | "ANY"; // "ANY" = not tied to a specific content type (banners)
  requiresContentId: boolean;
  requiresLanguageId?: boolean;
  requiresChapterId?: boolean;
  minDimensions?: { width: number; height: number };
}

export const PURPOSE_RULES: Record<UploadPurpose, PurposeRule> = {
  // Media Library: a generic picture that is not tied to any title yet; it can fill any shareable artwork slot later.
  LIBRARY_IMAGE: { kind: KIND.IMAGE, contentTypes: "ANY", requiresContentId: false },
  MOVIE_MASTER: { kind: KIND.VIDEO, contentTypes: ["MOVIE"], requiresContentId: true },
  TRAILER: { kind: KIND.VIDEO, contentTypes: ["MOVIE"], requiresContentId: true },
  TEASER: { kind: KIND.VIDEO, contentTypes: ["MOVIE"], requiresContentId: true },
  POSTER: { kind: KIND.IMAGE, contentTypes: ["MOVIE", "EBOOK", "AUDIOBOOK"], requiresContentId: true, minDimensions: MIN_IMAGE_DIMENSIONS["POSTER"] },
  BACKDROP: { kind: KIND.IMAGE, contentTypes: ["MOVIE", "EBOOK", "AUDIOBOOK"], requiresContentId: true, minDimensions: MIN_IMAGE_DIMENSIONS["BACKDROP"] },
  THUMBNAIL: { kind: KIND.IMAGE, contentTypes: ["MOVIE", "EBOOK", "AUDIOBOOK"], requiresContentId: true, minDimensions: MIN_IMAGE_DIMENSIONS["THUMBNAIL"] },
  NORMAL_BANNER: { kind: KIND.IMAGE, contentTypes: "ANY", requiresContentId: false, minDimensions: MIN_IMAGE_DIMENSIONS["NORMAL_BANNER"] },
  HERO_BANNER: { kind: KIND.IMAGE, contentTypes: "ANY", requiresContentId: false, minDimensions: MIN_IMAGE_DIMENSIONS["HERO_BANNER"] },
  LATEST_RELEASE_BANNER: { kind: KIND.IMAGE, contentTypes: "ANY", requiresContentId: false, minDimensions: MIN_IMAGE_DIMENSIONS["LATEST_RELEASE_BANNER"] },
  MOBILE_BANNER: { kind: KIND.IMAGE, contentTypes: "ANY", requiresContentId: false, minDimensions: MIN_IMAGE_DIMENSIONS["MOBILE_BANNER"] },
  CAPTION: { kind: KIND.CAPTION, contentTypes: ["MOVIE"], requiresContentId: true, requiresLanguageId: true },
  AUDIO_TRACK: { kind: KIND.AUDIO, contentTypes: ["MOVIE"], requiresContentId: true, requiresLanguageId: true },
  EBOOK_EPUB: { kind: KIND.EBOOK, contentTypes: ["EBOOK"], requiresContentId: true },
  EBOOK_PDF: { kind: KIND.EBOOK, contentTypes: ["EBOOK"], requiresContentId: true },
  EBOOK_SAMPLE: { kind: KIND.EBOOK, contentTypes: ["EBOOK"], requiresContentId: true },
  EBOOK_FRONT_COVER: { kind: KIND.IMAGE, contentTypes: ["EBOOK"], requiresContentId: true, minDimensions: MIN_IMAGE_DIMENSIONS["EBOOK_FRONT_COVER"] },
  EBOOK_BACK_COVER: { kind: KIND.IMAGE, contentTypes: ["EBOOK"], requiresContentId: true, minDimensions: MIN_IMAGE_DIMENSIONS["EBOOK_BACK_COVER"] },
  EBOOK_SPINE: { kind: KIND.IMAGE, contentTypes: ["EBOOK"], requiresContentId: true, minDimensions: MIN_IMAGE_DIMENSIONS["EBOOK_SPINE"] },
  EBOOK_FULL_WRAP: { kind: KIND.IMAGE, contentTypes: ["EBOOK"], requiresContentId: true, minDimensions: MIN_IMAGE_DIMENSIONS["EBOOK_FULL_WRAP"] },
  AUDIOBOOK_FILE: { kind: KIND.AUDIO, contentTypes: ["AUDIOBOOK"], requiresContentId: true },
  AUDIOBOOK_PREVIEW: { kind: KIND.AUDIO, contentTypes: ["AUDIOBOOK"], requiresContentId: true },
  AUDIOBOOK_COVER: { kind: KIND.IMAGE, contentTypes: ["AUDIOBOOK"], requiresContentId: true, minDimensions: MIN_IMAGE_DIMENSIONS["AUDIOBOOK_COVER"] },
  AUDIOBOOK_CHAPTER: { kind: KIND.AUDIO, contentTypes: ["AUDIOBOOK"], requiresContentId: true, requiresChapterId: true },
  NARRATOR_IMAGE: { kind: KIND.IMAGE, contentTypes: ["AUDIOBOOK", "EBOOK"], requiresContentId: true, minDimensions: MIN_IMAGE_DIMENSIONS["NARRATOR_IMAGE"] },
};

export function isPurposeAllowedForContentType(purpose: UploadPurpose, contentType: ContentType): boolean {
  const rule = PURPOSE_RULES[purpose];
  return rule.contentTypes === "ANY" || rule.contentTypes.includes(contentType);
}

/** Section 4: which purposes produce a PRIVATE object vs one that may be served from a public CDN URL. */
const PUBLIC_PURPOSES = new Set<UploadPurpose>(["LIBRARY_IMAGE", "POSTER", "BACKDROP", "THUMBNAIL", "NORMAL_BANNER", "HERO_BANNER", "LATEST_RELEASE_BANNER", "MOBILE_BANNER", "EBOOK_FRONT_COVER", "EBOOK_BACK_COVER", "EBOOK_SPINE", "EBOOK_FULL_WRAP", "AUDIOBOOK_COVER", "NARRATOR_IMAGE"]);
export const isPublicPurpose = (purpose: UploadPurpose): boolean => PUBLIC_PURPOSES.has(purpose);
