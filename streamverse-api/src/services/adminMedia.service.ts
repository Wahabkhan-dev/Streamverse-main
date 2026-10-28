import * as contentRepository from "../repositories/content.repository";
import { NotFoundError } from "../utils/errors";
import * as mediaAssetRepository from "../repositories/mediaAsset.repository";
import { retryProcessing } from "./upload.service";

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
