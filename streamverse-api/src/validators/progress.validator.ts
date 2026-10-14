import { z } from "zod";

/** Section 34: position/duration sanity — never negative, and position can't run far past a known duration. */
export const movieProgressSchema = z
  .object({ positionSeconds: z.number().int().min(0), durationSeconds: z.number().int().min(1).optional() })
  .refine((v) => v.durationSeconds === undefined || v.positionSeconds <= v.durationSeconds + 5, { message: "positionSeconds cannot exceed durationSeconds", path: ["positionSeconds"] });
export type MovieProgressInput = z.infer<typeof movieProgressSchema>;

/** Section 36: an EPUB "location" (reader-defined position) and a PDF "page" are different concepts — a reader sends whichever applies, never both forced. */
export const ebookProgressSchema = z
  .object({ location: z.string().max(500).optional(), page: z.number().int().min(1).optional(), percentage: z.number().min(0).max(100).optional() })
  .refine((v) => v.location !== undefined || v.page !== undefined, { message: "Provide a location or a page", path: ["location"] });
export type EbookProgressInput = z.infer<typeof ebookProgressSchema>;

export const audiobookProgressSchema = z
  .object({ chapterId: z.string().min(1).optional(), positionSeconds: z.number().int().min(0), durationSeconds: z.number().int().min(1).optional() })
  .refine((v) => v.durationSeconds === undefined || v.positionSeconds <= v.durationSeconds + 5, { message: "positionSeconds cannot exceed durationSeconds", path: ["positionSeconds"] });
export type AudiobookProgressInput = z.infer<typeof audiobookProgressSchema>;
