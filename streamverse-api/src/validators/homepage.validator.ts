import { z } from "zod";

/** Section 35: a manual section is curated by hand; a dynamic one is a named, fixed query — never free-text SQL. */
export const DYNAMIC_SECTION_QUERIES = ["TRENDING", "POPULAR", "NEW_RELEASE", "FEATURED", "LATEST"] as const;

const homepageSectionShape = z.object({
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
  /** MANUAL = hand-picked titles; the five dynamic queries; HERO = the top carousel; BANNER / COLLECTION = one banner or collection chosen below. */
  type: z.enum(["MANUAL", "HERO", "BANNER", "COLLECTION", ...DYNAMIC_SECTION_QUERIES]),
  bannerId: z.string().min(1).nullable().optional(),
  collectionId: z.string().min(1).nullable().optional(),
  /** Required for a dynamic section — which catalog it resolves against. Never set for MANUAL. */
  contentType: z.enum(["MOVIE", "EBOOK", "AUDIOBOOK"]).optional(),
});

const NON_CATALOG_TYPES = ["MANUAL", "HERO", "BANNER", "COLLECTION"];
const refineContentTypeMatchesSectionType = <T extends { type: string; contentType?: string | undefined }>(data: T) =>
  NON_CATALOG_TYPES.includes(data.type) ? !data.contentType : !!data.contentType;
const CONTENT_TYPE_REFINE_MESSAGE = { message: "A dynamic section requires contentType; MANUAL, HERO, BANNER and COLLECTION sections must not set it.", path: ["contentType"] };

export const createHomepageSectionSchema = homepageSectionShape
  .refine(refineContentTypeMatchesSectionType, CONTENT_TYPE_REFINE_MESSAGE)
  .refine((d) => d.type !== "BANNER" || !!d.bannerId, { message: "Choose the banner this section shows.", path: ["bannerId"] })
  .refine((d) => d.type !== "COLLECTION" || !!d.collectionId, { message: "Choose the collection this section shows.", path: ["collectionId"] });

export const homepageQuerySchema = z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(100).default(100) });
export type CreateHomepageSectionInput = z.infer<typeof createHomepageSectionSchema>;

/**
 * `key` is deliberately absent — it is the one field that can never change once a section exists.
 * The type/contentType invariant is only re-checked when BOTH are present in the same request — a
 * partial update of just `displayTitle`, say, never needs to resend contentType.
 */
export const updateHomepageSectionSchema = homepageSectionShape
  .omit({ key: true })
  .partial()
  .extend({ expectedUpdatedAt: z.coerce.date().optional() })
  .refine((data) => data.type === undefined || refineContentTypeMatchesSectionType({ type: data.type, contentType: data.contentType }), CONTENT_TYPE_REFINE_MESSAGE);
export type UpdateHomepageSectionInput = z.infer<typeof updateHomepageSectionSchema>;

export const addHomepageItemSchema = z.object({ contentId: z.string().min(1), displayOrder: z.number().int().min(0).default(0) });
export type AddHomepageItemInput = z.infer<typeof addHomepageItemSchema>;

export const reorderHomepageItemsSchema = z.array(z.object({ contentId: z.string().min(1), displayOrder: z.number().int().min(0) })).min(1);
export type ReorderHomepageItemsInput = z.infer<typeof reorderHomepageItemsSchema>;
