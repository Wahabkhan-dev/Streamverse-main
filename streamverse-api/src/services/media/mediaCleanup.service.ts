import { env } from "../../config/env";
import { logger } from "../../config/logger";
import * as mediaAssetRepository from "../../repositories/mediaAsset.repository";
import { getStorageProvider } from "../storage";

/**
 * Section 46: three kinds of cleanup candidate, never a referenced asset —
 *  1. PENDING/UPLOADING rows whose presign TTL passed and nothing ever landed in storage
 *  2. DELETED rows (aborted or replaced) whose grace period has passed (Section 44/45: a replaced asset
 *     is marked DELETED immediately but its object is only removed once nothing could still be using it)
 * Runs off a queue job (Section 59), never a request. Processes a bounded batch per run.
 */
export async function runMediaCleanup(): Promise<{ expiredRemoved: number; deletedRemoved: number }> {
  const now = new Date();
  const storage = getStorageProvider();

  const expired = await mediaAssetRepository.findExpiredPending(now);
  let expiredRemoved = 0;
  for (const asset of expired) {
    if (asset.storageKey) await storage.deleteObject(asset.storageKey).catch((err) => logger.warn({ assetId: asset.id, err }, "cleanup: failed to delete expired-pending object"));
    await mediaAssetRepository.hardDelete(asset.id).catch((err) => logger.warn({ assetId: asset.id, err }, "cleanup: failed to remove expired-pending row"));
    expiredRemoved++;
  }

  const graceCutoff = new Date(now.getTime() - env.MEDIA_CLEANUP_GRACE_SECONDS * 1000);
  const pastGrace = await mediaAssetRepository.findDeletedPastGrace(graceCutoff);
  let deletedRemoved = 0;
  for (const asset of pastGrace) {
    const withRefs = await mediaAssetRepository.findWithReferences(asset.id);
    if (mediaAssetRepository.isReferenced(withRefs)) continue; // still referenced somewhere — never touch it
    if (asset.storageKey) await storage.deleteObject(asset.storageKey).catch((err) => logger.warn({ assetId: asset.id, err }, "cleanup: failed to delete object"));
    await mediaAssetRepository.hardDelete(asset.id).catch((err) => logger.warn({ assetId: asset.id, err }, "cleanup: failed to remove row"));
    deletedRemoved++;
  }

  logger.info({ expiredRemoved, deletedRemoved }, "media: cleanup run complete");
  return { expiredRemoved, deletedRemoved };
}
