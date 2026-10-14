import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** A random, URL-safe opaque token (refresh tokens, password reset tokens). Never predictable. */
export const randomToken = (bytes = 48): string => randomBytes(bytes).toString("base64url");

/** One-way hash of an opaque token, for storage. The raw token itself is never persisted. */
export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

/** Constant-time comparison of two hashes, so lookups don't leak timing information. */
export function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
