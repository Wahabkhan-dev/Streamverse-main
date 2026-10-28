import { randomUUID } from "node:crypto";
import type { UploadPurpose } from "../../constants/upload";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/epub+zip": "epub",
  "text/vtt": "vtt",
  "application/x-subrip": "srt",
  "text/plain": "txt",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

const PURPOSE_PREFIX: Partial<Record<UploadPurpose, string>> = {
  LIBRARY_IMAGE: "images/library",
  MOVIE_MASTER: "movie/master",
  TRAILER: "movie/trailer",
  TEASER: "movie/teaser",
  POSTER: "images/poster",
  BACKDROP: "images/backdrop",
  THUMBNAIL: "images/thumbnail",
  NORMAL_BANNER: "images/banner/normal",
  HERO_BANNER: "images/banner/hero",
  LATEST_RELEASE_BANNER: "images/banner/latest-release",
  MOBILE_BANNER: "images/banner/mobile",
  CAPTION: "captions",
  AUDIO_TRACK: "movie/audio-track",
  EBOOK_EPUB: "ebooks/epub",
  EBOOK_PDF: "ebooks/pdf",
  EBOOK_SAMPLE: "ebooks/sample",
  EBOOK_FRONT_COVER: "images/ebook/front-cover",
  EBOOK_BACK_COVER: "images/ebook/back-cover",
  EBOOK_SPINE: "images/ebook/spine",
  EBOOK_FULL_WRAP: "images/ebook/full-wrap",
  AUDIOBOOK_FILE: "audiobooks/file",
  AUDIOBOOK_PREVIEW: "audiobooks/preview",
  AUDIOBOOK_COVER: "images/audiobook/cover",
  AUDIOBOOK_CHAPTER: "audiobooks/chapter",
  NARRATOR_IMAGE: "images/narrator",
};

/**
 * Phase 6 (Section 13/76): predictable, non-colliding, never derived from a user-supplied filename.
 * `content/{contentId}/{purpose-prefix}/{uuid}.{ext}` for content-scoped purposes; banners (not tied to
 * one content row) use `banners/{purpose-prefix}/{uuid}.{ext}` instead.
 */
export function buildStorageKey(purpose: UploadPurpose, mimeType: string, contentId: string | undefined, library = false): string {
  const prefix = PURPOSE_PREFIX[purpose] ?? "misc";
  const ext = EXTENSION_BY_MIME[mimeType] ?? "bin";
  const uuid = randomUUID();
  if (contentId) return `content/${contentId}/${prefix}/${uuid}.${ext}`;
  if (library) return `media/${prefix}/${uuid}.${ext}`;
  return `banners/${prefix}/${uuid}.${ext}`;
}

/** Section 13: a filename is kept only as metadata (never as a path) and stripped of anything dangerous first. */
export function sanitizeFileName(name: string): string {
  const base = name.replace(/^.*[/\\]/, ""); // strip any directory component the client sent
  const cleaned = base.replace(/[^\w.\-() ]/g, "_").slice(0, 200);
  return cleaned || "file";
}

/** `media/movie/master/{uuid}.mp4` (library upload) -> `media/hls/{uuid}`; legacy `content/{id}/movie/master/{uuid}.mp4` -> `content/{id}/hls`. */
export const hlsRoot = (masterKey: string): string => {
  const lib = /^(media)\/movie\/master\/([^/.]+)\.[^/]+$/.exec(masterKey);
  return lib ? `${lib[1]}/hls/${lib[2]}` : masterKey.replace(/\/movie\/master\/.+$/, "/hls");
};

export function renditionSegmentKey(masterKey: string, variant: string, segmentName: string): string {
  return `${hlsRoot(masterKey)}/${variant}/${segmentName}`;
}

export function renditionPlaylistKey(masterKey: string, variant: string): string {
  return renditionSegmentKey(masterKey, variant, `${variant}.m3u8`);
}

export function masterPlaylistKey(masterKey: string): string {
  return `${hlsRoot(masterKey)}/master.m3u8`;
}
