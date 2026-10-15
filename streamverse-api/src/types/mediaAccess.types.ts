/**
 * Response type for POST /api/v1/media/ebooks/:contentId/access.
 *
 * `signedUrl` is a short-lived pre-signed download URL for the ebook file (null when access is
 * denied or the file is not yet ready).  `fileType` distinguishes EPUB from PDF so the frontend
 * reader does not have to sniff the URL.  `progress` is the current reading position for the
 * authenticated user, if any has been saved.
 */
export interface EbookAccessResponse {
  /** Short-lived pre-signed URL to the ebook file; null when canConsume is false or file not ready. */
  signedUrl: string | null;
  /** Explicit file format — never inferred from the URL. Null when no file is available. */
  fileType: "epub" | "pdf" | null;
  /** The content ID of the ebook. */
  contentId: string;
  /** ISO-8601 timestamp at which the signed URL expires; null when no URL was issued. */
  expiresAt: string | null;
  /**
   * Current reading progress for the authenticated user, or null if none has been saved.
   * `location` holds an EPUB CFI string (EPUB only); `page` holds the last PDF page (1-indexed,
   * PDF only); `pct` is 0-100.
   */
  progress: { location: string | null; page: number | null; pct: number } | null;
}
