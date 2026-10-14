import { z } from "zod";
import { contentBaseSchema, contentBaseUpdateSchema, languageRoleSchema } from "./content.validator";
import { listQuery } from "../utils/pagination";

/** Audiobook-only metadata. `durationSeconds` is never guessed — it stays unset until real media exists. */
export const audiobookMetadataSchema = z.object({
  author: z.string().max(200).optional(),
  narrator: z.string().max(200).optional(),
  publisher: z.string().max(200).optional(),
  isbn: z.string().trim().max(20).optional(),
  series: z.string().max(200).optional(),
  seriesNumber: z.number().int().min(1).optional(),
  releaseDate: z.coerce.date().optional(),
  deliveryMode: z.enum(["SINGLE_FILE", "CHAPTER_FILES"]).default("SINGLE_FILE"),
  mainAssetId: z.string().min(1).optional(),
  previewAssetId: z.string().min(1).optional(),
  coverAssetId: z.string().min(1).optional(),
  thumbnailAssetId: z.string().min(1).optional(),
  copyrightOwner: z.string().max(200).optional(),
  copyrightYear: z.number().int().min(1888).max(2100).optional(),
  rightsNotes: z.string().max(2000).optional(),
});

export const createAudiobookSchema = contentBaseSchema.extend({
  audiobook: audiobookMetadataSchema.default({ deliveryMode: "SINGLE_FILE" }),
  genreIds: z.array(z.string().min(1)).max(10).default([]),
  tagIds: z.array(z.string().min(1)).max(30).default([]),
  warningTypeIds: z.array(z.string().min(1)).max(20).default([]),
  languages: z.array(languageRoleSchema).default([]),
});
export type CreateAudiobookInput = z.infer<typeof createAudiobookSchema>;

export const updateAudiobookSchema = contentBaseUpdateSchema.extend({
  audiobook: audiobookMetadataSchema.partial().optional(),
  genreIds: z.array(z.string().min(1)).max(10).optional(),
  tagIds: z.array(z.string().min(1)).max(30).optional(),
  warningTypeIds: z.array(z.string().min(1)).max(20).optional(),
  languages: z.array(languageRoleSchema).optional(),
});
export type UpdateAudiobookInput = z.infer<typeof updateAudiobookSchema>;

export const audiobookListQuerySchema = listQuery(["title", "createdAt", "updatedAt", "publishedAt", "status"] as const, "createdAt").extend({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "UNPUBLISHED", "ARCHIVED", "PROCESSING", "PROCESSING_FAILED"]).optional(),
  visibility: z.enum(["PUBLIC", "SUBSCRIBERS_ONLY", "HIDDEN"]).optional(),
  genreId: z.string().optional(),
  languageId: z.string().optional(),
  ageRating: z.string().optional(),
});

export const audiobookEditionSchema = z.object({
  languageId: z.string().min(1),
  narrator: z.string().trim().min(1).max(200),
  narratorBio: z.string().max(2000).optional(),
  narratorImageAssetId: z.string().min(1).optional(),
  audioAssetId: z.string().min(1).optional(),
});
export type AudiobookEditionInput = z.infer<typeof audiobookEditionSchema>;
export const updateAudiobookEditionSchema = audiobookEditionSchema.partial();
export type UpdateAudiobookEditionInput = z.infer<typeof updateAudiobookEditionSchema>;

/** Section 12/31: unique per (audiobookId, chapterNumber) at the database level too. */
export const audiobookChapterSchema = z.object({
  chapterNumber: z.number().int().min(1),
  title: z.string().trim().min(1).max(200),
  audioAssetId: z.string().min(1).optional(),
  durationSeconds: z.number().int().min(1).optional(),
  startTimeSeconds: z.number().int().min(0).optional(),
  endTimeSeconds: z.number().int().min(0).optional(),
  displayOrder: z.number().int().min(0).default(0),
});
export type AudiobookChapterInput = z.infer<typeof audiobookChapterSchema>;
export const updateAudiobookChapterSchema = audiobookChapterSchema.partial();
export type UpdateAudiobookChapterInput = z.infer<typeof updateAudiobookChapterSchema>;
