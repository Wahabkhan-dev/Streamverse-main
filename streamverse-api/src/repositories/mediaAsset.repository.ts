import type { MediaAssetStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export const findById = (id: string) => prisma.mediaAsset.findUnique({ where: { id } });
export const findManyByIds = (ids: string[]) => prisma.mediaAsset.findMany({ where: { id: { in: ids } } });

export const create = (data: Prisma.MediaAssetUncheckedCreateInput) => prisma.mediaAsset.create({ data });
export const update = (id: string, data: Prisma.MediaAssetUncheckedUpdateInput) => prisma.mediaAsset.update({ where: { id }, data });

export const listByContentId = (contentId: string) => prisma.mediaAsset.findMany({ where: { contentId, deletedAt: null }, orderBy: { createdAt: "desc" } });
export const listRenditions = (sourceAssetId: string) => prisma.mediaAsset.findMany({ where: { sourceAssetId }, orderBy: { createdAt: "asc" } });

export const softDelete = (id: string) => prisma.mediaAsset.update({ where: { id }, data: { status: "DELETED", deletedAt: new Date() } });
export const hardDelete = (id: string) => prisma.mediaAsset.delete({ where: { id } });

/** Section 46/50: PENDING/UPLOADING uploads whose presign TTL has passed, never touched again. */
export const findExpiredPending = (now: Date) => prisma.mediaAsset.findMany({ where: { status: { in: ["PENDING", "UPLOADING"] }, expiresAt: { lt: now } } });

/** Section 46: assets explicitly marked for cleanup (replaced, aborted) whose grace period has passed. */
export const findDeletedPastGrace = (now: Date) => prisma.mediaAsset.findMany({ where: { status: "DELETED", deletedAt: { lt: now } } });

export const createMultipartUpload = (assetId: string, providerUploadId: string, expiresAt: Date) => prisma.multipartUpload.create({ data: { assetId, providerUploadId, expiresAt } });
export const findMultipartUploadByAssetId = (assetId: string) => prisma.multipartUpload.findUnique({ where: { assetId } });
export const deleteMultipartUpload = (assetId: string) => prisma.multipartUpload.delete({ where: { assetId } });

export const setStatus = (id: string, status: MediaAssetStatus, extra: Prisma.MediaAssetUncheckedUpdateInput = {}) => prisma.mediaAsset.update({ where: { id }, data: { status, ...extra } });

/** Section 67/68: every named slot a MediaAsset could be wired into — all declared as back-relations on
 * MediaAsset itself, so checking "is this asset referenced anywhere" is one query, not one per table. */
const REFERENCE_RELATIONS = {
  movieCaptionFor: true,
  movieAudioTrackFor: true,
  movieCastImageFor: true,
  ebookEpubFor: true,
  ebookPdfFor: true,
  ebookCoverFor: true,
  audiobookNarratorImageFor: true,
  audiobookAudioFor: true,
  audiobookChapterFor: true,
  collectionBannerFor: true,
  bannerDesktopFor: true,
  bannerMobileFor: true,
  moviePosterFor: true,
  movieBackdropFor: true,
  movieThumbnailFor: true,
  movieMasterFor: true,
  movieTrailerFor: true,
  movieTeaserFor: true,
  ebookPrimaryEpubFor: true,
  ebookPrimaryPdfFor: true,
  ebookSampleFor: true,
  ebookFrontCoverFor: true,
  ebookBackCoverFor: true,
  ebookSpineFor: true,
  ebookFullWrapFor: true,
  ebookThumbnailFor: true,
  audiobookMainFor: true,
  audiobookPreviewFor: true,
  audiobookCoverFor: true,
  audiobookThumbnailFor: true,
} as const;

export const findWithReferences = (id: string) => prisma.mediaAsset.findUnique({ where: { id }, include: REFERENCE_RELATIONS });

export function isReferenced(row: Record<string, unknown> | null): boolean {
  if (!row) return false;
  return Object.keys(REFERENCE_RELATIONS).some((key) => row[key] != null);
}
