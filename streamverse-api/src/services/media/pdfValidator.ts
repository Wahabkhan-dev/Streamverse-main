/**
 * Phase 6 (Section 40): confirms the file really is a PDF via its header/trailer bytes, and derives a
 * best-effort page count by counting `/Type /Page` object markers. That count is a heuristic, not an
 * authoritative parse of the page tree — it is exposed as `detectedPageCount` and never silently
 * overwrites an Admin-provided `pageCount` (Section 40's "define policy": the detected value is always
 * the DERIVED one, kept separate from the source-of-truth field the Admin can edit).
 */
export interface PdfValidationResult {
  valid: boolean;
  reason?: string;
  detectedPageCount?: number;
}

export function validatePdf(buf: Buffer): PdfValidationResult {
  if (buf.length < 5 || buf.toString("ascii", 0, 5) !== "%PDF-") return { valid: false, reason: "Not a valid PDF (missing %PDF- header)" };
  const tail = buf.subarray(Math.max(0, buf.length - 2048)).toString("latin1");
  if (!tail.includes("%%EOF")) return { valid: false, reason: "Not a valid PDF (missing %%EOF trailer)" };

  const text = buf.toString("latin1");
  const pageMatches = text.match(/\/Type\s*\/Page(?!s)/g);
  return { valid: true, detectedPageCount: pageMatches ? pageMatches.length : undefined };
}
