/**
 * Phase 6 (Section 2): one storage abstraction, implemented once for every S3-compatible provider (AWS
 * S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces all speak the same API) plus a local-filesystem
 * dev adapter (Section 84/85) — nothing outside `services/storage/` ever imports an SDK directly or
 * knows which provider is configured.
 */
import type { Readable } from "node:stream";

export interface PresignedUpload {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

export interface HeadResult {
  exists: boolean;
  sizeBytes?: number;
  contentType?: string;
  etag?: string;
}

export interface MultipartPart {
  partNumber: number;
  etag: string;
}

export interface ListedObject {
  key: string;
  sizeBytes: number;
  lastModified?: Date;
}

export interface StorageProvider {
  /** One bounded page of keys under a prefix (reconciliation only - never called per page request). */
  listObjects(prefix: string, limit: number, continuationToken?: string): Promise<{ objects: ListedObject[]; nextToken?: string }>;
  /** Section 8/80: a short-lived, single-object, single-method presigned PUT — never broad bucket access. */
  createUploadUrl(key: string, contentType: string, ttlSeconds: number): Promise<PresignedUpload>;
  /** Section 51/54/81: a short-lived signed GET for private media. */
  createDownloadUrl(key: string, ttlSeconds: number, responseContentType?: string): Promise<string>;
  /** Section 10: used to verify an upload actually landed — never trust the client's word alone. */
  headObject(key: string): Promise<HeadResult>;
  /** Section 11/46/67: physical cleanup after a DB-level decision has already been made. */
  deleteObject(key: string): Promise<void>;
  objectExists(key: string): Promise<boolean>;
  copyObject?(sourceKey: string, destKey: string): Promise<void>;
  /** Reads a byte range — used for magic-byte sniffing (Section 16) without downloading a whole file. */
  getObjectRange(key: string, start: number, end: number): Promise<Buffer>;
  /** The whole object as a stream: offline downloads are proxied through the API, so the browser needs no bucket CORS. */
  getObjectStream(key: string): Promise<{ stream: Readable; sizeBytes?: number }>;
  /** Server-side upload (e.g. a processed rendition) — not a presigned client flow. */
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  /** A durable URL for a PUBLIC object (Section 52) — never used for private media. */
  getPublicUrl(key: string): string;

  /** Section 47/48: S3-compatible multipart upload, for files too large for one PUT. */
  initiateMultipartUpload(key: string, contentType: string): Promise<{ providerUploadId: string }>;
  signMultipartPart(key: string, providerUploadId: string, partNumber: number, ttlSeconds: number): Promise<string>;
  completeMultipartUpload(key: string, providerUploadId: string, parts: MultipartPart[]): Promise<{ etag?: string }>;
  abortMultipartUpload(key: string, providerUploadId: string): Promise<void>;
  /** The parts the storage actually received (number + ETag): lets the server finish an upload even when the browser could not read the ETags. */
  listMultipartParts(key: string, providerUploadId: string): Promise<MultipartPart[]>;
}
