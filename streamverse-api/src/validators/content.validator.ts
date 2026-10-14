import { z } from "zod";

/**
 * Domain shapes for the fields every piece of content shares. These support Phase 4's admin content
 * APIs; no route uses them yet (Section 54/60). Nothing here is a database constraint — a DRAFT is valid
 * with only a title (Section 33/34); these schemas describe what a value must look like *if present*.
 */

const isoCountryCode = z
  .string()
  .length(2)
  .transform((v) => v.toUpperCase())
  .refine((v) => /^[A-Z]{2}$/.test(v), "Use a 2-letter ISO country code");

/** Section 20/21: INCLUDE/EXCLUDE need at least one country; WORLDWIDE must not carry any. */
export const territorySchema = z
  .object({ mode: z.enum(["WORLDWIDE", "INCLUDE", "EXCLUDE"]), countryCodes: z.array(isoCountryCode).default([]) })
  .refine((v) => v.mode === "WORLDWIDE" || v.countryCodes.length > 0, { message: "Choose at least one country for INCLUDE/EXCLUDE", path: ["countryCodes"] })
  .refine((v) => v.mode !== "WORLDWIDE" || v.countryCodes.length === 0, { message: "WORLDWIDE should not list countries", path: ["countryCodes"] });

/** Section 21/66: minimumAge is required exactly when ageRestricted is true, and ignored otherwise. */
export const ageRestrictionSchema = z
  .object({ ageRating: z.string().max(10).optional(), ageRestricted: z.boolean().default(false), minimumAge: z.number().int().min(0).max(21).optional() })
  .refine((v) => !v.ageRestricted || v.minimumAge !== undefined, { message: "minimumAge is required when ageRestricted is true", path: ["minimumAge"] })
  .transform((v) => (v.ageRestricted ? v : { ...v, minimumAge: undefined }));

export const seoSchema = z.object({ seoTitle: z.string().max(70).optional(), seoDescription: z.string().max(160).optional(), seoKeywords: z.array(z.string().trim().min(1)).max(20).default([]) });

export const promotionFlagsSchema = z.object({ featured: z.boolean().default(false), trending: z.boolean().default(false), popular: z.boolean().default(false), newRelease: z.boolean().default(false) });

const dateLike = z.coerce.date();

/** Fields every Content row shares, regardless of type. */
export const contentBaseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  /** omit to derive the slug from the title; provide to request a specific one (still made unique) */
  manualSlug: z.string().trim().min(1).max(220).optional(),
  summary: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  visibility: z.enum(["PUBLIC", "SUBSCRIBERS_ONLY", "HIDDEN"]).default("PUBLIC"),
  releaseDate: dateLike.optional(),
  availableFrom: dateLike.optional(),
  availableUntil: dateLike.optional(),
  age: ageRestrictionSchema.optional(),
  territory: territorySchema.optional(),
  promo: promotionFlagsSchema.optional(),
  seo: seoSchema.optional(),
});
export type ContentBaseInput = z.infer<typeof contentBaseSchema>;

export const languageRoleSchema = z.object({ languageId: z.string().min(1), role: z.enum(["PRIMARY", "ORIGINAL", "ADDITIONAL_AUDIO", "TRANSLATION"]) });

export const captionSchema = z.object({ languageId: z.string().min(1), type: z.enum(["SUBTITLE", "CLOSED_CAPTION", "SDH"]), mediaAssetId: z.string().min(1).optional() });
export const audioTrackSchema = z.object({ languageId: z.string().min(1), mediaAssetId: z.string().min(1).optional() });

export const castMemberSchema = z.object({ name: z.string().trim().min(1).max(120), characterName: z.string().trim().max(120).optional(), imageAssetId: z.string().min(1).optional(), displayOrder: z.number().int().min(0).default(0) });
export const crewMemberSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.enum(["DIRECTOR", "PRODUCER", "WRITER", "CINEMATOGRAPHER", "COMPOSER", "EDITOR", "OTHER"]),
  displayOrder: z.number().int().min(0).default(0),
});

/**
 * Every field optional (Section 46/47: PATCH-style partial update). `expectedUpdatedAt` is the
 * optimistic-concurrency check (Section 62).
 *
 * `visibility` is re-declared here WITHOUT `.default("PUBLIC")`: `.partial()` only wraps a field in
 * `.optional()`, and Zod's `ZodOptional(ZodDefault(...))` still applies the inner default when the key
 * is omitted — so without this override, any partial update that doesn't explicitly resend `visibility`
 * would silently reset it back to PUBLIC. (Every other field here is `.optional()` with no default of
 * its own, or an optional OBJECT whose own defaulted sub-fields never run because the object itself is
 * simply absent — so this is the one field that needed the explicit fix.)
 */
export const contentBaseUpdateSchema = contentBaseSchema.partial().extend({
  visibility: z.enum(["PUBLIC", "SUBSCRIBERS_ONLY", "HIDDEN"]).optional(),
  expectedUpdatedAt: z.coerce.date().optional(),
});
export type ContentBaseUpdateInput = z.infer<typeof contentBaseUpdateSchema>;

/** Used by every status-transition endpoint (publish/unpublish/archive/cancel-schedule/delete) — the concurrency check is optional. */
export const statusActionSchema = z.object({ expectedUpdatedAt: z.coerce.date().optional() });

/** Used by schedule endpoints for every content type (Section 23). */
export const scheduleSchema = z.object({ publishAt: z.coerce.date().refine((d) => d > new Date(), "publishAt must be in the future"), expectedUpdatedAt: z.coerce.date().optional() });

/**
 * Used by every reorder endpoint (Section 33/50): chapters, collection items, homepage sections/items.
 * The body is the bare array (`[{ id, displayOrder }, ...]`), matching the shape the spec gives for
 * homepage section reorder.
 */
export const reorderSchema = z.array(z.object({ id: z.string().min(1), displayOrder: z.number().int().min(0) })).min(1);
export type ReorderInput = z.infer<typeof reorderSchema>;
