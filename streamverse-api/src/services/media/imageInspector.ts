/**
 * Phase 6 (Section 16/18/19): reads real image dimensions from the file's own bytes (never trusts the
 * declared Content-Type alone) without a third-party image library — just the three magic-byte formats
 * this API accepts (Section 77: SVG is deliberately not one of them).
 */
export interface ImageDimensions {
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp";
}

export function detectImageDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    // PNG: IHDR chunk starts at byte 16 (8 sig + 4 length + 4 "IHDR")
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: "png" };
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8 " && buf.length >= 30) {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, format: "webp" };
    }
    if (chunk === "VP8L" && buf.length >= 25) {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, format: "webp" };
    }
    if (chunk === "VP8X" && buf.length >= 30) {
      const width = 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16));
      const height = 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16));
      return { width, height, format: "webp" };
    }
    return null;
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    // JPEG: walk the marker segments looking for an SOF marker (0xC0-0xCF, excluding DHT/JPG extensions)
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1]!;
      if (marker === 0xd8 || marker === 0xd9) break; // SOI/EOI, nothing more to read
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      const length = buf.readUInt16BE(offset + 2);
      if (isSof) return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7), format: "jpeg" };
      offset += 2 + length;
    }
    return null;
  }
  return null;
}

/** Section 16: the real magic-byte check behind "do not trust the Content-Type header". */
export function detectDeclaredMimeMismatch(buf: Buffer, declaredMime: string): boolean {
  const sig = detectImageDimensions(buf);
  if (!sig) return true; // not a recognizable image at all, regardless of what was declared
  const expected: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  return expected[sig.format] !== declaredMime;
}
