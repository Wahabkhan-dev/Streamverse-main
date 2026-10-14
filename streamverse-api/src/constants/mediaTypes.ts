import { MediaAssetStatus, MediaAssetType } from "@prisma/client";

// Phase 1 sketched this as a plain string union; Phase 3's Prisma schema is now the one source of truth
// for the actual set of types; this file just re-exports it under the name the rest of the app imports.
export { MediaAssetStatus, MediaAssetType };
export const MEDIA_ASSET_TYPES = Object.values(MediaAssetType);
export const MEDIA_ASSET_STATUSES = Object.values(MediaAssetStatus);
