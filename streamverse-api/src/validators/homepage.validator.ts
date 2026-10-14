import { z } from "zod";

/** Section 35: a manual section is curated by hand; a dynamic one is a named, fixed query — never free-text SQL. */
export const DYNAMIC_SECTION_QUERIES = ["TRENDING", "POPULAR", "NEW_RELEASE", "FEATURED", "LATEST"] as const;

export const createHomepageSectionSchema = z.object({
  /** stable forever — never renamed (Section 32/39) */
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores"),
  displayTitle: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(true),
  displayOrder: z.number().int().min(0).default(0),
  itemLimit: z.number().int().min(1).max(50).default(12),
  type: z.enum(["MANUAL", ...DYNAMIC_SECTION_QUERIES]),
});
export type CreateHomepageSectionInput = z.infer<typeof createHomepageSectionSchema>;

/** `key` is deliberately absent — it is the one field that can never change once a section exists. */
export const updateHomepageSectionSchema = createHomepageSectionSchema.omit({ key: true }).partial().extend({ expectedUpdatedAt: z.coerce.date().optional() });
export type UpdateHomepageSectionInput = z.infer<typeof updateHomepageSectionSchema>;

export const addHomepageItemSchema = z.object({ contentId: z.string().min(1), displayOrder: z.number().int().min(0).default(0) });
export type AddHomepageItemInput = z.infer<typeof addHomepageItemSchema>;

export const reorderHomepageItemsSchema = z.array(z.object({ contentId: z.string().min(1), displayOrder: z.number().int().min(0) })).min(1);
export type ReorderHomepageItemsInput = z.infer<typeof reorderHomepageItemsSchema>;
