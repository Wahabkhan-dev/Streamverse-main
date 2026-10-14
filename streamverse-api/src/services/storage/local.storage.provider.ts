import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env";
import type { HeadResult, MultipartPart, PresignedUpload, StorageProvider } from "./storage.provider";

/**
 * Section 84/85: a dev-only filesystem adapter behind the SAME `StorageProvider` interface — nothing in
 * business logic branches on "are we local". Files live under `LOCAL_STORAGE_DIR`; "presigned" URLs are
 * real HMAC-signed tokens (not a trust-the-client shortcut) served by `localStorage.routes.ts`, which is
 * only mounted outside production (Section 85: "do not use this in production").
 */
export function createLocalStorageProvider(): StorageProvider {
  const root = path.resolve(env.LOCAL_STORAGE_DIR);
  const secret = env.JWT_SECRET; // reuse an existing long random secret — no new config needed for a dev-only adapter

  function safePath(key: string): string {
    // Section 76: reject traversal outright rather than merely normalizing it away.
    if (key.includes("..") || key.startsWith("/") || key.includes("\0")) throw new Error(`Unsafe storage key: ${key}`);
    const resolved = path.resolve(root, key);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) throw new Error(`Unsafe storage key: ${key}`);
    return resolved;
  }

  function sign(payload: string): string {
    return createHmac("sha256", secret).update(payload).digest("hex");
  }

  function verify(payload: string, signature: string): boolean {
    const expected = sign(payload);
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  const multipartState = new Map<string, { parts: Map<number, Buffer> }>();

  return {
    async createUploadUrl(key, contentType, ttlSeconds): Promise<PresignedUpload> {
      const expiresAt = Date.now() + ttlSeconds * 1000;
      const payload = `PUT:${key}:${expiresAt}`;
      const token = sign(payload);
      return {
        url: `/dev/storage/${encodeURIComponent(key)}?method=PUT&expires=${expiresAt}&token=${token}`,
        method: "PUT",
        headers: { "Content-Type": contentType },
        expiresAt: new Date(expiresAt).toISOString(),
      };
    },

    async createDownloadUrl(key, ttlSeconds) {
      const expiresAt = Date.now() + ttlSeconds * 1000;
      const payload = `GET:${key}:${expiresAt}`;
      const token = sign(payload);
      return `/dev/storage/${encodeURIComponent(key)}?method=GET&expires=${expiresAt}&token=${token}`;
    },

    async headObject(key): Promise<HeadResult> {
      try {
        const s = await stat(safePath(key));
        return { exists: true, sizeBytes: s.size };
      } catch {
        return { exists: false };
      }
    },

    async deleteObject(key) {
      await rm(safePath(key), { force: true });
    },

    async objectExists(key) {
      return (await this.headObject(key)).exists;
    },

    async copyObject(sourceKey, destKey) {
      const buf = await readFile(safePath(sourceKey));
      await mkdir(path.dirname(safePath(destKey)), { recursive: true });
      await writeFile(safePath(destKey), buf);
    },

    async getObjectRange(key, start, end) {
      const buf = await readFile(safePath(key));
      return buf.subarray(start, end + 1);
    },

    async putObject(key, body) {
      await mkdir(path.dirname(safePath(key)), { recursive: true });
      await writeFile(safePath(key), body);
    },

    getPublicUrl(key) {
      return env.MEDIA_BASE_URL ? `${env.MEDIA_BASE_URL.replace(/\/$/, "")}/${key}` : `/dev/storage/${encodeURIComponent(key)}?public=1`;
    },

    async initiateMultipartUpload() {
      const providerUploadId = randomUUID();
      multipartState.set(providerUploadId, { parts: new Map() });
      return { providerUploadId };
    },

    async signMultipartPart(key, providerUploadId, partNumber, ttlSeconds) {
      const expiresAt = Date.now() + ttlSeconds * 1000;
      const payload = `PART:${key}:${providerUploadId}:${partNumber}:${expiresAt}`;
      const token = sign(payload);
      return `/dev/storage/multipart/${encodeURIComponent(providerUploadId)}/${partNumber}?key=${encodeURIComponent(key)}&expires=${expiresAt}&token=${token}`;
    },

    async completeMultipartUpload(key, providerUploadId, parts: MultipartPart[]) {
      const state = multipartState.get(providerUploadId);
      if (!state) throw new Error("Unknown multipart upload");
      const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
      const buffers = ordered.map((p) => state.parts.get(p.partNumber) ?? Buffer.alloc(0));
      await mkdir(path.dirname(safePath(key)), { recursive: true });
      await writeFile(safePath(key), Buffer.concat(buffers));
      multipartState.delete(providerUploadId);
      return {};
    },

    async abortMultipartUpload(_key, providerUploadId) {
      multipartState.delete(providerUploadId);
    },

    _verifyToken: verify,
    _writePart(providerUploadId: string, partNumber: number, body: Buffer) {
      const state = multipartState.get(providerUploadId);
      if (!state) throw new Error("Unknown multipart upload");
      state.parts.set(partNumber, body);
    },
  } as StorageProvider & { _verifyToken: typeof verify; _writePart: (id: string, part: number, body: Buffer) => void };
}
