import { PURPOSE_RULES, type UploadPurpose } from "../../constants/upload";
import type { StorageProvider } from "../storage/storage.provider";
import { logger } from "../../config/logger";
import { detectImageDimensions, detectDeclaredMimeMismatch } from "./imageInspector";
import { validateEpubRanges } from "./epubValidator";
import { validatePdfRanges } from "./pdfValidator";
import { validateCaptionFile } from "./captionValidator";
import { scan } from "./malwareScan.service";

const IMAGE_SNIFF_BYTES = 128 * 1024;
const SCAN_SAMPLE_BYTES = 1024 * 1024; // enough for PNG/JPEG/WebP headers, including a JPEG with a large APPn block

/** Section 16/18/19: real dimensions from the file's own bytes, cross-checked against the declared MIME and the purpose's minimum quality bar. */
export async function imageValidationSummary(storage: StorageProvider, key: string, declaredMime: string, purpose: UploadPurpose) {
  const buf = await storage.getObjectRange(key, 0, IMAGE_SNIFF_BYTES - 1);
  if (detectDeclaredMimeMismatch(buf, declaredMime)) throw new Error("The uploaded file's real format does not match the declared image type.");
  const dims = detectImageDimensions(buf);
  if (!dims) throw new Error("Could not determine image dimensions — the file may be corrupt.");
  const min = PURPOSE_RULES[purpose].minDimensions;
  if (min && (dims.width < min.width || dims.height < min.height)) {
    throw new Error(`Image is ${dims.width}x${dims.height}, below the required minimum of ${min.width}x${min.height} for ${purpose}.`);
  }
  return { width: dims.width, height: dims.height };
}

/** Section 39/40/78: EPUB (zip-bomb-guarded) or PDF structural check, plus the (not-yet-wired) malware scan hook. */
export async function pdfOrEpubValidationSummary(storage: StorageProvider, key: string, purpose: UploadPurpose, sizeBytes: number) {
  // Never the whole file in memory (an eBook upload can be 200 MB): only the byte ranges each check needs, and for a PDF's page
  // count the file streams past in chunks. The malware-scan hook (not wired to a scanner yet) gets the first MB.
  const read = (start: number, end: number) => storage.getObjectRange(key, start, end);
  const scanResult = await scan(await read(0, Math.max(1, Math.min(sizeBytes, SCAN_SAMPLE_BYTES)) - 1));
  if (scanResult.status === "INFECTED") throw new Error("This file failed a malware scan and was rejected.");
  if (scanResult.status === "NOT_CONFIGURED") logger.warn({ key, purpose }, "media: malware scan not configured — file accepted without being scanned");

  if (purpose === "EBOOK_EPUB" || purpose === "EBOOK_SAMPLE") {
    const result = await validateEpubRanges(sizeBytes, read);
    if (!result.valid) throw new Error(result.reason ?? "Invalid EPUB file");
    return { metadata: { epubEntryCount: result.entryCount } };
  }
  const result = await validatePdfRanges(sizeBytes, read, async () => (await storage.getObjectStream(key)).stream as AsyncIterable<Buffer>);
  if (!result.valid) throw new Error(result.reason ?? "Invalid PDF file");
  return { metadata: { detectedPageCount: result.detectedPageCount } };
}

export async function captionValidationSummary(storage: StorageProvider, key: string) {
  const buf = await storage.getObjectRange(key, 0, 2 * 1024 * 1024 - 1);
  const scanResult = await scan(buf);
  if (scanResult.status === "INFECTED") throw new Error("This file failed a malware scan and was rejected.");
  const result = validateCaptionFile(buf);
  if (!result.valid) throw new Error(result.reason ?? "Invalid caption file");
  return { metadata: { captionFormat: result.format, cueCount: result.cueCount } };
}
