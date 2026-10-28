import { z } from "zod";
import { PURPOSE_RULES } from "../constants/upload";

const roleEnum = z.enum(Object.keys(PURPOSE_RULES) as [string, ...string[]]);
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

export const libraryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  search: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(100).optional()),
  category: z.preprocess(emptyToUndefined, z.enum(["images", "videos", "audio", "documents"]).optional()),
  assetRole: z.preprocess(emptyToUndefined, roleEnum.optional()),
  status: z.preprocess(emptyToUndefined, z.enum(["PENDING", "UPLOADING", "UPLOADED", "PROCESSING", "READY", "FAILED", "MISSING"]).optional()),
  attachedType: z.preprocess(emptyToUndefined, z.enum(["movies", "ebooks", "audiobooks", "homepage", "banners", "collections", "unattached"]).optional()),
  sort: z.enum(["newest", "oldest", "name", "size", "type"]).default("newest"),
});
export type LibraryListQuery = z.infer<typeof libraryListQuerySchema>;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
export const updateMediaMetadataSchema = z
  .object({
    displayTitle: optionalText(190),
    altText: optionalText(190),
    caption: optionalText(190),
    notes: optionalText(5000),
    folder: optionalText(100),
  })
  .strict();
export type UpdateMediaMetadataInput = z.infer<typeof updateMediaMetadataSchema>;

export const mediaIdParamSchema = z.object({ assetId: z.string().min(1) });
export const replaceMediaSchema = z.object({ newAssetId: z.string().min(1) });
export const bulkDeleteSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) });
export const reconcileSchema = z.object({
  batch: z.number().int().min(1).max(500).default(100),
  scanBucket: z.boolean().default(true),
  scanLimit: z.number().int().min(100).max(5000).default(1000),
});
