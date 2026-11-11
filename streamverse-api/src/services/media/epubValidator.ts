/**
 * Phase 6 (Section 39/78): EPUB is a ZIP container. This parses just enough of the ZIP central
 * directory to confirm it IS a well-formed zip, that required EPUB structure exists, and that nothing
 * in it looks like a zip-bomb or a path-traversal entry — it does not extract or render anything, so
 * there is no deep publishing/DRM validation here (documented as out of scope for this phase).
 */
export interface EpubValidationResult {
  valid: boolean;
  reason?: string;
  entryCount?: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;

const MAX_ENTRIES = 5000;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;

/** Largest central directory accepted (5000 entries of long names fit in a few MB). */
const MAX_CENTRAL_DIR_BYTES = 32 * 1024 * 1024;
/** End-of-central-directory record (22 bytes) plus the longest allowed zip comment. */
const EOCD_SEARCH_BYTES = 65557;

/** Finds the EOCD record within the file's last bytes; -1 if absent. */
function findEocd(tail: Buffer): number {
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

type Located = { ok: true; totalEntries: number; centralDirOffset: number; centralDirSize: number } | { ok: false; result: EpubValidationResult };

/** Step 1, from the first 4 bytes and the last ~64 KB only: is it a zip, and where is its central directory? */
function locateCentralDirectory(head: Buffer, tail: Buffer, size: number): Located {
  if (size < 22 || head.length < 4 || head.readUInt32LE(0) !== LOCAL_HEADER_SIGNATURE) return { ok: false, result: { valid: false, reason: "Not a valid ZIP container" } };
  const eocd = findEocd(tail);
  if (eocd === -1) return { ok: false, result: { valid: false, reason: "Not a valid ZIP container (no end-of-central-directory record)" } };
  const totalEntries = tail.readUInt16LE(eocd + 10);
  const centralDirSize = tail.readUInt32LE(eocd + 12);
  const centralDirOffset = tail.readUInt32LE(eocd + 16);
  if (totalEntries > MAX_ENTRIES) return { ok: false, result: { valid: false, reason: "Too many entries (possible zip bomb)" } };
  if (centralDirOffset + centralDirSize > size || centralDirSize > MAX_CENTRAL_DIR_BYTES) return { ok: false, result: { valid: false, reason: "Corrupt central directory" } };
  return { ok: true, totalEntries, centralDirOffset, centralDirSize };
}

/** Step 2, from the central directory bytes only: entry names, sizes, and the required EPUB file. */
function checkCentralDirectory(cd: Buffer, totalEntries: number): EpubValidationResult {
  let offset = 0;
  let totalUncompressed = 0;
  let sawContainerXml = false;
  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > cd.length || cd.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) return { valid: false, reason: "Corrupt central directory entry" };
    const uncompressedSize = cd.readUInt32LE(offset + 24);
    const fileNameLength = cd.readUInt16LE(offset + 28);
    const extraLength = cd.readUInt16LE(offset + 30);
    const commentLength = cd.readUInt16LE(offset + 32);
    const fileName = cd.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    if (fileName.includes("..") || fileName.startsWith("/")) return { valid: false, reason: `Unsafe entry path: ${fileName}` };
    if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) return { valid: false, reason: "An entry is implausibly large (possible zip bomb)" };
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) return { valid: false, reason: "Total uncompressed size is implausibly large (possible zip bomb)" };
    if (fileName === "META-INF/container.xml") sawContainerXml = true;

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  if (!sawContainerXml) return { valid: false, reason: "Missing META-INF/container.xml (not a valid EPUB)" };
  return { valid: true, entryCount: totalEntries };
}

/** Validates an EPUB already in memory (small files, tests). */
export function validateEpub(buf: Buffer): EpubValidationResult {
  const tailStart = Math.max(0, buf.length - EOCD_SEARCH_BYTES);
  const where = locateCentralDirectory(buf.subarray(0, 4), buf.subarray(tailStart), buf.length);
  if (!where.ok) return where.result;
  return checkCentralDirectory(buf.subarray(where.centralDirOffset, where.centralDirOffset + where.centralDirSize), where.totalEntries);
}

/**
 * Validates an EPUB by reading only the byte ranges the check needs (its first 4 bytes, its last ~64 KB and its central
 * directory), never the whole file: an upload can be 200 MB and the check runs inside the API process.
 */
export async function validateEpubRanges(size: number, read: (start: number, end: number) => Promise<Buffer>): Promise<EpubValidationResult> {
  if (size < 22) return { valid: false, reason: "Not a valid ZIP container" };
  const tailStart = Math.max(0, size - EOCD_SEARCH_BYTES);
  const [head, tail] = await Promise.all([read(0, 3), read(tailStart, size - 1)]);
  const where = locateCentralDirectory(head, tail, size);
  if (!where.ok) return where.result;
  if (where.centralDirSize === 0) return checkCentralDirectory(Buffer.alloc(0), where.totalEntries);
  const cd = await read(where.centralDirOffset, where.centralDirOffset + where.centralDirSize - 1);
  return checkCentralDirectory(cd, where.totalEntries);
}
