import * as contentRepository from "../repositories/content.repository";
import * as mediaAssetRepository from "../repositories/mediaAsset.repository";
import { ConflictError, NotFoundError } from "../utils/errors";
import type { AuditContext } from "./auditLog.service";
import { recordAudit } from "./auditLog.service";
import { getStorageProvider } from "./storage";
import { retryProcessing } from "./upload.service";
import { logger } from "../config/logger";

/** Section 66: everything attached/uploaded for one content row — never includes a storage secret. */
export async function listMediaForContent(contentId: string) {
  if (!(await contentRepository.findActiveById(contentId))) throw new NotFoundError("Content not found");
  const rows = await mediaAssetRepository.listByContentId(contentId);
  return rows.map((a) => ({
    id: a.id,
    type: a.type,
    status: a.status,
    originalFileName: a.originalFileName,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    width: a.width,
    height: a.height,
    durationSeconds: a.durationSeconds,
    resolution: a.resolution,
    bitrate: a.bitrate,
    processingError: a.processingError,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));
}

/**
 * Section 67/68: refuses to destroy an asset that is still wired into a slot on PUBLISHED content — the
 * admin must replace or unpublish first, so customer playback is never broken out from under it. An
 * asset that was never attached (or whose content isn't published) is safe to soft-delete immediately;
 * the physical object is removed later by the cleanup job, once the grace period passes.
 */
export async function deleteMedia(assetId: string, ctx: AuditContext) {
  const asset = await mediaAssetRepository.findWithReferences(assetId);
  if (!asset || asset.deletedAt) throw new NotFoundError("Media asset not found");

  const referenced = mediaAssetRepository.isReferenced(asset);
  if (referenced && asset.contentId) {
    const content = await contentRepository.findActiveById(asset.contentId);
    if (content?.status === "PUBLISHED") {
      throw new ConflictError("This asset is still attached to published content. Replace it with a new one, or unpublish the content, before deleting.");
    }
  }

  await mediaAssetRepository.softDelete(assetId);
  if (asset.storageKey) {
    try {
      await getStorageProvider().deleteObject(asset.storageKey);
    } catch (err) {
      logger.warn({ assetId, err }, "media: failed to delete object immediately (cleanup job will retry)");
    }
  }
  await recordAudit(ctx, { action: "media.deleted", entityType: "MEDIA_ASSET", entityId: assetId });
}

/** Section 43: the actual slot wiring happens through the existing Phase 4 admin update endpoints (e.g.
 * `PUT /admin/movies/:id` with `movie.posterAssetId`), which already call `assertAssetRef` — this
 * endpoint only tells the Admin UI whether an asset WOULD be attachable, without changing anything. */
export async function checkAttachable(contentId: string, assetId: string) {
  const content = await contentRepository.findActiveById(contentId);
  if (!content) throw new NotFoundError("Content not found");
  const asset = await mediaAssetRepository.findById(assetId);
  if (!asset || asset.deletedAt) throw new NotFoundError("Media asset not found");
  if (asset.contentId && asset.contentId !== contentId) return { attachable: false, reason: "This asset was uploaded for different content." };
  if (asset.status !== "READY") return { attachable: false, reason: `Asset is not ready yet (status: ${asset.status}).` };
  return { attachable: true };
}

export const retryProcessingForAsset = retryProcessing;
