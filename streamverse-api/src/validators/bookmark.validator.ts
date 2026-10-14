import { z } from "zod";

export const createBookmarkSchema = z.object({ location: z.string().trim().min(1).max(500), page: z.number().int().min(1).optional(), label: z.string().trim().max(120).optional() });
export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;
