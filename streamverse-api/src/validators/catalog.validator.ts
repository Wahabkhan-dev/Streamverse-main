import { z } from "zod";
import { listQuery } from "../utils/pagination";

const boolish = z.coerce.boolean().optional();

/** Shared by GET /movies, /ebooks, /audiobooks (Section 5/7/9). */
export const catalogListQuerySchema = listQuery(["title", "releaseDate", "publishedAt"] as const, "publishedAt").extend({
  search: z.string().trim().max(200).optional(),
  genre: z.string().trim().max(60).optional(),
  language: z.string().trim().max(10).optional(),
  ageRating: z.string().trim().max(10).optional(),
  featured: boolish,
  trending: boolish,
  popular: boolish,
  newRelease: boolish,
});
export type CatalogListQuery = z.infer<typeof catalogListQuerySchema>;
