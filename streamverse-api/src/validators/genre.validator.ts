import { z } from "zod";

export const createGenreSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().max(500).optional(),
  contentType: z.enum(["MOVIE", "EBOOK", "AUDIOBOOK"]).optional(),
});
export type CreateGenreInput = z.infer<typeof createGenreSchema>;

export const updateGenreSchema = createGenreSchema.partial().extend({ active: z.boolean().optional() });
export type UpdateGenreInput = z.infer<typeof updateGenreSchema>;
