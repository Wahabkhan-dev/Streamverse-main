import { z } from "zod";
import { contentBaseSchema, contentBaseUpdateSchema, languageRoleSchema } from "./content.validator";
import { listQuery } from "../utils/pagination";

/** eBook-only metadata. ISBN is optional and never generated (Section 8). */
export const ebookMetadataSchema = z.object({
  author: z.string().max(200).optional(),
  coAuthor: z.string().max(200).optional(),
  editor: z.string().max(200).optional(),
  publisher: z.string().max(200).optional(),
  isbn: z.string().trim().max(20).optional(),
  edition: z.string().max(60).optional(),
  series: z.string().max(200).optional(),
  seriesNumber: z.number().int().min(1).optional(),
  pageCount: z.number().int().min(1).optional(),
  publicationDate: z.coerce.date().optional(),
  copyrightOwner: z.string().max(200).optional(),
  copyrightYear: z.number().int().min(1450).max(2100).optional(),
  rightsNotes: z.string().max(2000).optional(),
  // the primary-language file set (Section 56); additional-language files live on an EbookEdition instead
  epubAssetId: z.string().min(1).optional(),
  pdfAssetId: z.string().min(1).optional(),
  sampleAssetId: z.string().min(1).optional(),
  frontCoverAssetId: z.string().min(1).optional(),
  backCoverAssetId: z.string().min(1).optional(),
  spineAssetId: z.string().min(1).optional(),
  fullWrapAssetId: z.string().min(1).optional(),
  thumbnailAssetId: z.string().min(1).optional(),
});

export const createEbookSchema = contentBaseSchema.extend({
  ebook: ebookMetadataSchema.default({}),
  genreIds: z.array(z.string().min(1)).max(10).default([]),
  tagIds: z.array(z.string().min(1)).max(30).default([]),
  warningTypeIds: z.array(z.string().min(1)).max(20).default([]),
  languages: z.array(languageRoleSchema).default([]),
});
export type CreateEbookInput = z.infer<typeof createEbookSchema>;

export const updateEbookSchema = contentBaseUpdateSchema.extend({
  ebook: ebookMetadataSchema.partial().optional(),
  genreIds: z.array(z.string().min(1)).max(10).optional(),
  tagIds: z.array(z.string().min(1)).max(30).optional(),
  warningTypeIds: z.array(z.string().min(1)).max(20).optional(),
  languages: z.array(languageRoleSchema).optional(),
});
export type UpdateEbookInput = z.infer<typeof updateEbookSchema>;

export const ebookListQuerySchema = listQuery(["title", "createdAt", "updatedAt", "publishedAt", "status"] as const, "createdAt").extend({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "UNPUBLISHED", "ARCHIVED", "PROCESSING", "PROCESSING_FAILED"]).optional(),
  visibility: z.enum(["PUBLIC", "SUBSCRIBERS_ONLY", "HIDDEN"]).optional(),
  genreId: z.string().optional(),
  languageId: z.string().optional(),
  ageRating: z.string().optional(),
});

/** Section 9: a translation/edition, added after the eBook exists — never a duplicate full record. */
export const ebookEditionSchema = z.object({
  languageId: z.string().min(1),
  translatedTitle: z.string().trim().min(1).max(200),
  translator: z.string().max(200).optional(),
  epubAssetId: z.string().min(1).optional(),
  pdfAssetId: z.string().min(1).optional(),
  coverAssetId: z.string().min(1).optional(),
});
export type EbookEditionInput = z.infer<typeof ebookEditionSchema>;

export const updateEbookEditionSchema = ebookEditionSchema.partial();
export type UpdateEbookEditionInput = z.infer<typeof updateEbookEditionSchema>;
