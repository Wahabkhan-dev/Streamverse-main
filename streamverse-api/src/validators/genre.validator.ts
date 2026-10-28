import { z } from "zod";

export const createGenreSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().max(500).optional(),
  contentType: z.enum(["MOVIE", "EBOOK", "AUDIOBOOK"]).optional(),
});
export type CreateGenreInput = z.infer<typeof createGenreSchema>;

/** `null` clears the kind (the genre applies to every kind of title again) or the description. */
export const updateGenreSchema = createGenreSchema
  .partial()
  .extend({ active: z.boolean().optional(), contentType: z.enum(["MOVIE", "EBOOK", "AUDIOBOOK"]).nullable().optional(), description: z.string().max(500).nullable().optional() });
export type UpdateGenreInput = z.infer<typeof updateGenreSchema>;
