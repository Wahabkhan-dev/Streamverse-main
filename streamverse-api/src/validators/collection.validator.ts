import { z } from "zod";
import { listQuery } from "../utils/pagination";

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  manualSlug: z.string().trim().min(1).max(140).optional(),
  description: z.string().max(1000).optional(),
  bannerAssetId: z.string().min(1).optional(),
});
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;

export const updateCollectionSchema = createCollectionSchema.partial().extend({
  status: z.enum(["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"]).optional(),
  expectedUpdatedAt: z.coerce.date().optional(),
});
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;

export const collectionListQuerySchema = listQuery(["name", "createdAt", "updatedAt"] as const, "createdAt").extend({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"]).optional(),
});

export const addCollectionItemSchema = z.object({ contentId: z.string().min(1), displayOrder: z.number().int().min(0).default(0) });
export type AddCollectionItemInput = z.infer<typeof addCollectionItemSchema>;

/** Section 30: identifies items by contentId, not the item row's own id. */
export const reorderCollectionItemsSchema = z.array(z.object({ contentId: z.string().min(1), displayOrder: z.number().int().min(0) })).min(1);
export type ReorderCollectionItemsInput = z.infer<typeof reorderCollectionItemsSchema>;
