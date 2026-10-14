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

function findEocd(buf: Buffer): number {
  const searchStart = Math.max(0, buf.length - 65557); // EOCD + max 64KB comment
  for (let i = buf.length - 22; i >= searchStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

export function validateEpub(buf: Buffer): EpubValidationResult {
  if (buf.length < 22 || buf.readUInt32LE(0) !== LOCAL_HEADER_SIGNATURE) return { valid: false, reason: "Not a valid ZIP container" };

  const eocdOffset = findEocd(buf);
  if (eocdOffset === -1) return { valid: false, reason: "Not a valid ZIP container (no end-of-central-directory record)" };

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buf.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  if (totalEntries > MAX_ENTRIES) return { valid: false, reason: "Too many entries (possible zip bomb)" };
  if (centralDirOffset + centralDirSize > buf.length) return { valid: false, reason: "Corrupt central directory" };

  let offset = centralDirOffset;
  let totalUncompressed = 0;
  let sawContainerXml = false;
  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) return { valid: false, reason: "Corrupt central directory entry" };
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const fileNameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const fileName = buf.toString("utf8", offset + 46, offset + 46 + fileNameLength);

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
