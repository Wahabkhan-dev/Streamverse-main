import type { MediaAssetType } from "@prisma/client";
import * as mediaAssetRepository from "../repositories/mediaAsset.repository";
import { ValidationError } from "../utils/errors";

/**
 * Section 56 (Phase 4) + Section 69/100 (Phase 6): Admin APIs attach an existing MediaAsset by id into a
 * named slot (e.g. `Movie.posterAssetId`). This now checks three things, not just "does the id exist":
 *  1. it exists and is the right MediaAssetType for the slot (Phase 4's original check)
 *  2. it is READY — a database row existing is not the same as the file being ready (Section 5/70)
 *  3. if it was uploaded FOR a specific content row, it is THIS content row (Section 100: an asset
 *     uploaded for Movie A can never be wired into Movie B by id alone)
 */
export async function assertAssetRef(field: string, id: string | undefined, allowed: MediaAssetType[], contentId?: string): Promise<void> {
  if (!id) return;
  const asset = await mediaAssetRepository.findById(id);
  if (!asset || asset.deletedAt) throw new ValidationError([{ path: field, message: "This media asset does not exist." }]);
  if (!allowed.includes(asset.type)) throw new ValidationError([{ path: field, message: `Expected a ${allowed.join(" or ")} asset, got ${asset.type}.` }]);
  if (contentId && asset.contentId && asset.contentId !== contentId) throw new ValidationError([{ path: field, message: "This media asset was uploaded for different content and cannot be attached here." }]);
  if (asset.status !== "READY") throw new ValidationError([{ path: field, message: `This media asset is not ready yet (status: ${asset.status}).` }]);
}

/**
 * Section 44/45/68: called AFTER a slot's asset id has already changed to a new one in the database —
 * never before, so customer playback is never left pointing at nothing between the two updates. The old
 * asset is marked DELETED with a grace period (Section 46); the cleanup job removes the underlying file
 * only once that grace period has passed, and only if nothing still references the row.
 */
export async function scheduleReplacementCleanup(oldAssetId: string | null | undefined, newAssetId: string | null | undefined): Promise<void> {
  if (!oldAssetId || oldAssetId === newAssetId) return;
  const old = await mediaAssetRepository.findById(oldAssetId);
  if (!old || old.deletedAt) return;
  await mediaAssetRepository.softDelete(oldAssetId);
}

/** Diffs one slot's old vs new asset id (Section 44) — used by movie/ebook/audiobook update services. */
export function changedSlot(oldValue: string | null | undefined, newValue: string | undefined): string | null {
  if (newValue === undefined) return null; // omitted: slot untouched
  if (newValue === oldValue) return null;
  return oldValue ?? null;
}
