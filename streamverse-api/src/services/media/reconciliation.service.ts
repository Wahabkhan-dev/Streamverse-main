import { logger } from "../../config/logger";
import { prisma } from "../../config/database";
import * as mediaAssetRepository from "../../repositories/mediaAsset.repository";
import { getStorageProvider } from "../storage";

/**
 * Section 91/92: a READY asset whose object has vanished from storage (bucket cleanup gone wrong, a
 * manual delete outside the app, ...) is marked MISSING rather than left silently claiming to be ready —
 * Admin then sees "re-upload required" instead of customers hitting a dead signed URL. Takes a bounded
 * `batchSize` and a cursor so a full bucket is never scanned synchronously in one request (Section 92).
 */
export async function reconcileBatch(batchSize = 200): Promise<{ checked: number; markedMissing: number }> {
  const storage = getStorageProvider();
  // Order by checkedAt (oldest-checked first) so each run advances past already-inspected rows.
  // checkedAt is set to now after every check regardless of outcome, so rows don't get stuck at
  // the head of the queue forever when they consistently exist in storage.
  const rows = await prisma.mediaAsset.findMany({ where: { status: "READY", storageKey: { not: null } }, take: batchSize, orderBy: { checkedAt: "asc" } });

  let markedMissing = 0;
  for (const row of rows) {
    const exists = await storage.objectExists(row.storageKey!).catch(() => true); // a storage error is not evidence of absence
    if (!exists) {
      await mediaAssetRepository.setStatus(row.id, "MISSING");
      markedMissing++;
      logger.warn({ assetId: row.id }, "media: READY asset's object is missing from storage — marked MISSING");
    } else {
      // Advance the cursor: touch updatedAt so this row sorts to the back on the next run.
      await prisma.mediaAsset.update({ where: { id: row.id }, data: { checkedAt: new Date() } });
    }
  }
  return { checked: rows.length, markedMissing };
}
