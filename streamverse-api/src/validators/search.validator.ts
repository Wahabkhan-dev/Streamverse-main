import { z } from "zod";

const q = z
  .string()
  .trim()
  .min(1, "q is required")
  .max(100, "Search is limited to 100 characters"); // Section 21: enforce a max length

export const searchQuerySchema = z.object({
  q,
  type: z.enum(["ALL", "MOVIES", "EBOOKS", "AUDIOBOOKS", "PEOPLE"]).default("ALL"),
  genre: z.string().trim().max(60).optional(),
  language: z.string().trim().max(10).optional(),
  ageRating: z.string().trim().max(10).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const suggestionsQuerySchema = z.object({ q: q });
