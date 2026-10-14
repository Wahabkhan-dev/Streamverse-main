import { z } from "zod";
import { captionSchema, audioTrackSchema, castMemberSchema, contentBaseSchema, contentBaseUpdateSchema, crewMemberSchema, languageRoleSchema } from "./content.validator";
import { listQuery } from "../utils/pagination";

/** Movie-only metadata, on top of the fields every Content shares. No route uses this yet — Phase 4. */
export const movieMetadataSchema = z.object({
  runtimeMinutes: z.number().int().min(1).max(1000).optional(),
  productionStudio: z.string().max(200).optional(),
  countryOfOrigin: z.string().length(2).transform((v) => v.toUpperCase()).optional(),
  copyrightOwner: z.string().max(200).optional(),
  copyrightYear: z.number().int().min(1888).max(2100).optional(),
  rightsNotes: z.string().max(2000).optional(),
  // named asset slots (Section 56): Admin attaches an existing MediaAsset id, never uploads one here
  posterAssetId: z.string().min(1).optional(),
  backdropAssetId: z.string().min(1).optional(),
  thumbnailAssetId: z.string().min(1).optional(),
  masterAssetId: z.string().min(1).optional(),
  trailerAssetId: z.string().min(1).optional(),
  teaserAssetId: z.string().min(1).optional(),
});

export const createMovieSchema = contentBaseSchema.extend({
  movie: movieMetadataSchema.default({}),
  genreIds: z.array(z.string().min(1)).max(10).default([]),
  tagIds: z.array(z.string().min(1)).max(30).default([]),
  warningTypeIds: z.array(z.string().min(1)).max(20).default([]),
  languages: z.array(languageRoleSchema).default([]),
  cast: z.array(castMemberSchema).default([]),
  crew: z.array(crewMemberSchema).default([]),
  captions: z.array(captionSchema).default([]),
  audioTracks: z.array(audioTrackSchema).default([]),
});
export type CreateMovieInput = z.infer<typeof createMovieSchema>;

/**
 * Update (PUT and PATCH both map here — Section 46/47): every field, including every relation array, is
 * optional. A relation array that is OMITTED is left alone; one that IS sent (even `[]`) replaces the
 * current selection (Section 48) — that distinction is why these arrays have no `.default([])`.
 */
export const updateMovieSchema = contentBaseUpdateSchema.extend({
  movie: movieMetadataSchema.partial().optional(),
  genreIds: z.array(z.string().min(1)).max(10).optional(),
  tagIds: z.array(z.string().min(1)).max(30).optional(),
  warningTypeIds: z.array(z.string().min(1)).max(20).optional(),
  languages: z.array(languageRoleSchema).optional(),
  cast: z.array(castMemberSchema).optional(),
  crew: z.array(crewMemberSchema).optional(),
  captions: z.array(captionSchema).optional(),
  audioTracks: z.array(audioTrackSchema).optional(),
});
export type UpdateMovieInput = z.infer<typeof updateMovieSchema>;

export const movieListQuerySchema = listQuery(["title", "createdAt", "updatedAt", "releaseDate", "publishedAt", "status"] as const, "createdAt").extend({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "UNPUBLISHED", "ARCHIVED", "PROCESSING", "PROCESSING_FAILED"]).optional(),
  visibility: z.enum(["PUBLIC", "SUBSCRIBERS_ONLY", "HIDDEN"]).optional(),
  genreId: z.string().optional(),
  languageId: z.string().optional(),
  ageRating: z.string().optional(),
});
