import type { MediaCategory, MediaStatus } from "@/api/mediaLibrary.api";

export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "-";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function fmtDuration(s: number | null | undefined): string {
  if (s == null) return "-";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

export const CATEGORY_LABEL: Record<MediaCategory, string> = {
  images: "Images",
  videos: "Videos",
  audio: "Audio",
  documents: "eBooks / Documents",
};

export const STATUS_LABEL: Record<MediaStatus, string> = {
  PENDING: "Preparing",
  UPLOADING: "Uploading",
  UPLOADED: "Processing",
  PROCESSING: "Processing",
  READY: "Ready",
  FAILED: "Failed",
  MISSING: "Missing in storage",
  DELETED: "Deleted",
};

/** "EBOOK_FRONT_COVER" -> "eBook front cover" */
export function roleLabel(type: string): string {
  const map: Record<string, string> = {
    LIBRARY_IMAGE: "Library image",
    POSTER: "Movie poster",
    BACKDROP: "Backdrop",
    THUMBNAIL: "Thumbnail",
    MOVIE_MASTER: "Movie file",
    TRAILER: "Trailer",
    TEASER: "Teaser",
    EBOOK_EPUB: "EPUB",
    EBOOK_PDF: "PDF",
    EBOOK_SAMPLE: "eBook sample",
    EBOOK_FRONT_COVER: "eBook cover",
    EBOOK_BACK_COVER: "eBook back cover",
    EBOOK_SPINE: "eBook spine",
    EBOOK_FULL_WRAP: "eBook full wrap",
    AUDIOBOOK_FILE: "Audiobook audio",
    AUDIOBOOK_PREVIEW: "Audio preview",
    AUDIOBOOK_COVER: "Audiobook cover",
    AUDIOBOOK_CHAPTER: "Chapter audio",
    NARRATOR_IMAGE: "Narrator photo",
    NORMAL_BANNER: "Banner",
    HERO_BANNER: "Hero banner",
    LATEST_RELEASE_BANNER: "Latest-release banner",
    MOBILE_BANNER: "Mobile banner",
    CAPTION: "Captions",
    AUDIO_TRACK: "Audio track",
  };
  return map[type] ?? type.toLowerCase().replace(/_/g, " ");
}

export const ROLE_OPTIONS = [
  "LIBRARY_IMAGE",
  "POSTER",
  "BACKDROP",
  "THUMBNAIL",
  "MOVIE_MASTER",
  "TRAILER",
  "EBOOK_FRONT_COVER",
  "EBOOK_EPUB",
  "EBOOK_PDF",
  "AUDIOBOOK_COVER",
  "AUDIOBOOK_FILE",
  "NORMAL_BANNER",
  "HERO_BANNER",
  "MOBILE_BANNER",
  "NARRATOR_IMAGE",
] as const;
