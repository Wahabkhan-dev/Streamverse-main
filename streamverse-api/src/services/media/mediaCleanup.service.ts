import { env } from "../../config/env";
import { logger } from "../../config/logger";
import * as mediaAssetRepository from "../../repositories/mediaAsset.repository";
import { usedAssetIds } from "./assetSlots";
import { getStorageProvider } from "../storage";

/**
 * Section 46: three kinds of cleanup candidate, never a referenced asset —
 *  1. PENDING/UPLOADING rows whose presign TTL passed and nothing ever landed in storage
 *  2. DELETED rows (aborted or replaced) whose grace period has passed (Section 44/45: a replaced asset
 *     is marked DELETED immediately but its object is only removed once nothing could still be using it)
 * Runs off a queue job (Section 59), never a request. Processes a bounded batch per run.
 */
/**
 * Removes the stored object, then the tracking row. If the object delete fails the row is KEPT, so the next
 * run retries (object deletes are idempotent) instead of orphaning the object with no record of it.
 */
async function removeAsset(asset: { id: string; storageKey: string | null }, storage: ReturnType<typeof getStorageProvider>): Promise<boolean> {
  try {
    if (asset.storageKey) await storage.deleteObject(asset.storageKey);
    await mediaAssetRepository.hardDelete(asset.id);
    return true;
  } catch (err) {
    logger.warn({ assetId: asset.id, err }, "cleanup: failed to remove asset; will retry next run");
    return false;
  }
}

export async function runMediaCleanup(): Promise<{ expiredRemoved: number; deletedRemoved: number }> {
  const now = new Date();
  const storage = getStorageProvider();

  const expired = await mediaAssetRepository.findExpiredPending(now);
  let expiredRemoved = 0;
  for (const asset of expired) {
    if (await removeAsset(asset, storage)) expiredRemoved++;
  }

  const graceCutoff = new Date(now.getTime() - env.MEDIA_CLEANUP_GRACE_SECONDS * 1000);
  const pastGrace = await mediaAssetRepository.findDeletedPastGrace(graceCutoff);
  let deletedRemoved = 0;
  for (const asset of pastGrace) {
    if ((await usedAssetIds([asset.id])).size) continue; // still referenced somewhere — never touch it
    if (await removeAsset(asset, storage)) deletedRemoved++;
  }

  logger.info({ expiredRemoved, deletedRemoved }, "media: cleanup run complete");
  return { expiredRemoved, deletedRemoved };
}
