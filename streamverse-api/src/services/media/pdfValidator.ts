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

const PAGE_MARKER = /\/Type\s*\/Page(?!s)/g;
/** Bytes carried from one chunk to the next so a marker split across chunks is still counted (markers are ~10-20 bytes). */
const OVERLAP = 64;

/**
 * Same checks as validatePdf, without holding the file in memory: the header and trailer are read as small byte ranges, and
 * the page markers are counted while the file streams past in chunks (an upload can be 200 MB).
 */
export async function validatePdfRanges(size: number, read: (start: number, end: number) => Promise<Buffer>, stream: () => Promise<AsyncIterable<Buffer>>): Promise<PdfValidationResult> {
  if (size < 5) return { valid: false, reason: "Not a valid PDF (missing %PDF- header)" };
  const [head, tail] = await Promise.all([read(0, 4), read(Math.max(0, size - 2048), size - 1)]);
  if (head.toString("ascii", 0, 5) !== "%PDF-") return { valid: false, reason: "Not a valid PDF (missing %PDF- header)" };
  if (!tail.toString("latin1").includes("%%EOF")) return { valid: false, reason: "Not a valid PDF (missing %%EOF trailer)" };

  let pages = 0;
  let carry = "";
  for await (const chunk of await stream()) {
    const text = carry + Buffer.from(chunk).toString("latin1");
    // count only markers that end beyond the carried-over part, so none is counted twice
    for (const m of text.matchAll(PAGE_MARKER)) if (m.index + m[0].length > carry.length) pages++;
    carry = text.slice(-OVERLAP);
  }
  return { valid: true, detectedPageCount: pages || undefined };
}
