import { env } from "../config/env";
import { ALLOWED_MIME_TYPES, PURPOSE_RULES, SIZE_LIMITS_BYTES, isPurposeAllowedForContentType, type UploadPurpose } from "../constants/upload";
import * as audiobookRepository from "../repositories/audiobook.repository";
import * as contentRepository from "../repositories/content.repository";
import * as languageRepository from "../repositories/language.repository";
import * as mediaAssetRepository from "../repositories/mediaAsset.repository";
import { captionValidationSummary, imageValidationSummary, pdfOrEpubValidationSummary } from "./media/uploadValidation.service";
import { buildStorageKey, sanitizeFileName } from "./media/storageKey.service";
import { getStorageProvider } from "./storage";
import { QUEUE_NAMES, getQueueProvider } from "./queue";
import type { AuditContext } from "./auditLog.service";
import { recordAudit } from "./auditLog.service";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors";
import type { PresignUploadInput } from "../validators/upload.validator";
import { logger } from "../config/logger";

const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

/** Section 8: validates purpose/content/MIME/size, creates the PENDING asset row, and returns a signed PUT. */
export async function presignUpload(input: PresignUploadInput, ctx: AuditContext = NO_ACTOR) {
  const purpose = input.purpose as UploadPurpose;
  const rule = PURPOSE_RULES[purpose];

  if (rule.requiresContentId && !input.contentId) throw new ValidationError([{ path: "contentId", message: "contentId is required for this upload purpose." }]);
  let content: Awaited<ReturnType<typeof contentRepository.findActiveById>> = null;
  if (input.contentId) {
    content = await contentRepository.findActiveById(input.contentId);
    if (!content) throw new NotFoundError("Content not found");
    if (!isPurposeAllowedForContentType(purpose, content.type)) throw new ValidationError([{ path: "purpose", message: `"${purpose}" is not a valid upload purpose for ${content.type} content.` }]);
  }

  if (rule.requiresLanguageId) {
    if (!input.languageId) throw new ValidationError([{ path: "languageId", message: "languageId is required for this upload purpose." }]);
    if (!(await languageRepository.findById(input.languageId))) throw new ValidationError([{ path: "languageId", message: "Language not found." }]);
  }
  if (rule.requiresChapterId) {
    if (!input.chapterId) throw new ValidationError([{ path: "chapterId", message: "chapterId is required for this upload purpose." }]);
    const chapter = await audiobookRepository.findChapter(input.chapterId);
    if (!chapter || chapter.audiobookId !== input.contentId) throw new ValidationError([{ path: "chapterId", message: "This chapter does not belong to the given audiobook." }]);
  }

  if (!ALLOWED_MIME_TYPES[rule.kind].includes(input.mimeType)) throw new ValidationError([{ path: "mimeType", message: `"${input.mimeType}" is not an allowed MIME type for ${rule.kind.toLowerCase()} uploads.` }]);
  if (input.sizeBytes > SIZE_LIMITS_BYTES[rule.kind]) throw new ValidationError([{ path: "sizeBytes", message: `File exceeds the ${Math.round(SIZE_LIMITS_BYTES[rule.kind] / (1024 * 1024))}MB limit for ${rule.kind.toLowerCase()} uploads.` }]);

  const storageKey = buildStorageKey(purpose, input.mimeType, input.contentId);
  const expiresAt = new Date(Date.now() + env.UPLOAD_URL_TTL_SECONDS * 1000);

  const asset = await mediaAssetRepository.create({
    contentId: input.contentId,
    type: purpose,
    storageKey,
    originalFileName: sanitizeFileName(input.fileName),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    languageId: input.languageId,
    status: "UPLOADING",
    createdById: ctx.userId,
    expiresAt,
  });

  const presigned = await getStorageProvider().createUploadUrl(storageKey, input.mimeType, env.UPLOAD_URL_TTL_SECONDS);

  logger.info({ requestId: ctx.requestId, userId: ctx.userId, assetId: asset.id, contentId: input.contentId, purpose }, "media: upload requested");
  await recordAudit(ctx, { action: "media.upload_presigned", entityType: "MEDIA_ASSET", entityId: asset.id, metadata: { purpose, contentId: input.contentId } });

  return { assetId: asset.id, uploadUrl: presigned.url, method: presigned.method, headers: presigned.headers, expiresAt: presigned.expiresAt };
}

function kindOf(purpose: UploadPurpose) {
  return PURPOSE_RULES[purpose].kind;
}

/** Section 10: verifies the object actually landed in storage before trusting the client's "done". */
export async function completeUpload(assetId: string, ctx: AuditContext = NO_ACTOR) {
  const asset = await mediaAssetRepository.findById(assetId);
  if (!asset || asset.deletedAt) throw new NotFoundError("Upload not found");

  // Section 94: idempotent — calling complete again after it already succeeded just returns the status.
  if (asset.status !== "PENDING" && asset.status !== "UPLOADING") return toStatusView(asset);
  if (!asset.storageKey) throw new ValidationError([{ path: "assetId", message: "This upload has no storage key." }]);

  const storage = getStorageProvider();
  const head = await storage.headObject(asset.storageKey);
  if (!head.exists) throw new ValidationError([{ path: "assetId", message: "The uploaded object was not found in storage. Upload the file before calling complete." }]);
  if (head.sizeBytes !== undefined && asset.sizeBytes !== null && Math.abs(head.sizeBytes - asset.sizeBytes) > Math.max(1024, asset.sizeBytes * 0.01)) {
    throw new ValidationError([{ path: "assetId", message: "The uploaded file size does not match what was declared when presigning." }]);
  }

  const purpose = asset.type as UploadPurpose;
  const kind = kindOf(purpose);
  const update: Parameters<typeof mediaAssetRepository.update>[1] = { checksum: head.etag, expiresAt: null };

  try {
    if (kind === "IMAGE") Object.assign(update, await imageValidationSummary(storage, asset.storageKey, asset.mimeType!, purpose));
    else if (kind === "EBOOK") Object.assign(update, await pdfOrEpubValidationSummary(storage, asset.storageKey, purpose, head.sizeBytes ?? asset.sizeBytes ?? 0));
    else if (kind === "CAPTION") Object.assign(update, await captionValidationSummary(storage, asset.storageKey));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Validation failed";
    await mediaAssetRepository.update(assetId, { status: "FAILED", processingError: message });
    throw new ValidationError([{ path: "assetId", message }]);
  }

  const needsAsyncProcessing = kind === "VIDEO" || kind === "AUDIO";
  const updated = await mediaAssetRepository.update(assetId, { ...update, sizeBytes: head.sizeBytes ?? asset.sizeBytes, status: needsAsyncProcessing ? "UPLOADED" : "READY" });

  if (needsAsyncProcessing) {
    const queueName = kind === "VIDEO" ? QUEUE_NAMES.VIDEO_PROCESSING : QUEUE_NAMES.AUDIO_PROCESSING;
    await getQueueProvider().enqueue(queueName, { assetId });
  }

  logger.info({ requestId: ctx.requestId, userId: ctx.userId, assetId, contentId: asset.contentId }, "media: upload completed");
  await recordAudit(ctx, { action: "media.upload_completed", entityType: "MEDIA_ASSET", entityId: assetId });

  return toStatusView(updated);
}

/** Section 11: cleans up the DB row and (best-effort) the object — never leaves an orphan PENDING row. */
export async function abortUpload(assetId: string, ctx: AuditContext = NO_ACTOR) {
  const asset = await mediaAssetRepository.findById(assetId);
  if (!asset || asset.deletedAt) throw new NotFoundError("Upload not found");
  if (asset.status === "READY") throw new ConflictError("Cannot abort a ready asset; delete it instead.");

  if (asset.storageKey) {
    try {
      if (await getStorageProvider().objectExists(asset.storageKey)) await getStorageProvider().deleteObject(asset.storageKey);
    } catch (err) {
      logger.warn({ assetId, err }, "media: failed to delete aborted upload's object (will not retry)");
    }
  }
  await mediaAssetRepository.hardDelete(assetId);
  logger.info({ requestId: ctx.requestId, userId: ctx.userId, assetId }, "media: upload aborted");
  await recordAudit(ctx, { action: "media.upload_aborted", entityType: "MEDIA_ASSET", entityId: assetId });
}

export async function getUploadStatus(assetId: string) {
  const asset = await mediaAssetRepository.findById(assetId);
  if (!asset || asset.deletedAt) throw new NotFoundError("Upload not found");
  return toStatusView(asset);
}

/** Section 27: allowed only after FAILED — resets state and re-enqueues the same processing job. */
export async function retryProcessing(assetId: string, ctx: AuditContext = NO_ACTOR) {
  const asset = await mediaAssetRepository.findById(assetId);
  if (!asset || asset.deletedAt) throw new NotFoundError("Media asset not found");
  if (asset.status !== "FAILED") throw new ConflictError(`Cannot retry: asset status is ${asset.status}, not FAILED.`);

  const kind = kindOf(asset.type as UploadPurpose);
  if (kind !== "VIDEO" && kind !== "AUDIO") throw new ConflictError("Only video/audio assets have an asynchronous processing step to retry.");

  const updated = await mediaAssetRepository.update(assetId, { status: "UPLOADED", processingError: null });
  const queueName = kind === "VIDEO" ? QUEUE_NAMES.VIDEO_PROCESSING : QUEUE_NAMES.AUDIO_PROCESSING;
  await getQueueProvider().enqueue(queueName, { assetId });

  await recordAudit(ctx, { action: "media.processing_retried", entityType: "MEDIA_ASSET", entityId: assetId });
  return toStatusView(updated);
}

/** Never includes storageKey (Section 9/66) — only what a status-polling or admin-list UI needs. */
function toStatusView(asset: NonNullable<Awaited<ReturnType<typeof mediaAssetRepository.findById>>>) {
  return {
    assetId: asset.id,
    type: asset.type,
    status: asset.status,
    originalFileName: asset.originalFileName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    durationSeconds: asset.durationSeconds,
    resolution: asset.resolution,
    processingError: asset.status === "FAILED" ? asset.processingError : null,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

export { toStatusView as toUploadStatusView };
