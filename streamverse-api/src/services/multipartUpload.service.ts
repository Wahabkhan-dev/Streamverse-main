import { env } from "../config/env";
import { ALLOWED_MIME_TYPES, PURPOSE_RULES, SIZE_LIMITS_BYTES, isPurposeAllowedForContentType, type UploadPurpose } from "../constants/upload";
import * as contentRepository from "../repositories/content.repository";
import * as mediaAssetRepository from "../repositories/mediaAsset.repository";
import { buildStorageKey, sanitizeFileName } from "./media/storageKey.service";
import { getStorageProvider } from "./storage";
import type { MultipartPart } from "./storage/storage.provider";
import type { AuditContext } from "./auditLog.service";
import { recordAudit } from "./auditLog.service";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors";
import type { PresignUploadInput } from "../validators/upload.validator";

const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

/**
 * Section 47/48: for files too large for one PUT (movie masters, chiefly). Mirrors `presignUpload`'s
 * validation, then opens an S3-compatible multipart upload instead of a single presigned PUT.
 */
export async function initiateMultipartUpload(input: PresignUploadInput, ctx: AuditContext = NO_ACTOR) {
  const purpose = input.purpose as UploadPurpose;
  const rule = PURPOSE_RULES[purpose];

  if (rule.requiresContentId && !input.contentId) throw new ValidationError([{ path: "contentId", message: "contentId is required for this upload purpose." }]);
  if (input.contentId) {
    const content = await contentRepository.findActiveById(input.contentId);
    if (!content) throw new NotFoundError("Content not found");
    if (!isPurposeAllowedForContentType(purpose, content.type)) throw new ValidationError([{ path: "purpose", message: `"${purpose}" is not valid for ${content.type} content.` }]);
  }
  if (!ALLOWED_MIME_TYPES[rule.kind].includes(input.mimeType)) throw new ValidationError([{ path: "mimeType", message: `"${input.mimeType}" is not allowed for ${rule.kind.toLowerCase()} uploads.` }]);
  if (input.sizeBytes > SIZE_LIMITS_BYTES[rule.kind]) throw new ValidationError([{ path: "sizeBytes", message: "File exceeds the size limit for this upload kind." }]);

  const storageKey = buildStorageKey(purpose, input.mimeType, input.contentId);
  const expiresAt = new Date(Date.now() + env.UPLOAD_URL_TTL_SECONDS * 1000);

  const asset = await mediaAssetRepository.create({
    contentId: input.contentId,
    type: purpose,
    storageKey,
    originalFileName: sanitizeFileName(input.fileName),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    status: "UPLOADING",
    createdById: ctx.userId,
    expiresAt,
  });

  const { providerUploadId } = await getStorageProvider().initiateMultipartUpload(storageKey, input.mimeType);
  await mediaAssetRepository.createMultipartUpload(asset.id, providerUploadId, expiresAt);

  await recordAudit(ctx, { action: "media.multipart_initiated", entityType: "MEDIA_ASSET", entityId: asset.id, metadata: { purpose } });
  return { assetId: asset.id, uploadId: providerUploadId, expiresAt: expiresAt.toISOString() };
}

/** Section 48/49: `uploadId` here is the asset id (our own, stable handle) — never the raw provider upload id, which the client never needs to see directly. */
async function findByAssetId(uploadId: string) {
  const asset = await mediaAssetRepository.findById(uploadId);
  if (!asset || asset.deletedAt) throw new NotFoundError("Upload not found");
  const multipart = await mediaAssetRepository.findMultipartUploadByAssetId(asset.id);
  if (!multipart) throw new NotFoundError("This asset has no in-progress multipart upload.");
  return { asset, multipart };
}

export async function signPart(uploadId: string, partNumber: number) {
  const { asset, multipart } = await findByAssetId(uploadId);
  const url = await getStorageProvider().signMultipartPart(asset.storageKey!, multipart.providerUploadId, partNumber, env.UPLOAD_URL_TTL_SECONDS);
  return { url, method: "PUT" as const, expiresAt: new Date(Date.now() + env.UPLOAD_URL_TTL_SECONDS * 1000).toISOString() };
}

export async function completeMultipart(uploadId: string, parts: MultipartPart[], ctx: AuditContext = NO_ACTOR) {
  const { asset, multipart } = await findByAssetId(uploadId);
  await getStorageProvider().completeMultipartUpload(asset.storageKey!, multipart.providerUploadId, parts);
  await mediaAssetRepository.deleteMultipartUpload(asset.id);
  await mediaAssetRepository.update(asset.id, { status: "UPLOADED", expiresAt: null });
  await recordAudit(ctx, { action: "media.multipart_completed", entityType: "MEDIA_ASSET", entityId: asset.id });
  return { assetId: asset.id, status: "UPLOADED" as const };
}

export async function abortMultipart(uploadId: string, ctx: AuditContext = NO_ACTOR) {
  const { asset, multipart } = await findByAssetId(uploadId);
  if (asset.status === "READY") throw new ConflictError("Cannot abort a ready asset.");
  await getStorageProvider().abortMultipartUpload(asset.storageKey!, multipart.providerUploadId);
  await mediaAssetRepository.deleteMultipartUpload(asset.id);
  if (asset.storageKey) await getStorageProvider().deleteObject(asset.storageKey).catch(() => undefined);
  await mediaAssetRepository.hardDelete(asset.id);
  await recordAudit(ctx, { action: "media.multipart_aborted", entityType: "MEDIA_ASSET", entityId: asset.id });
}
