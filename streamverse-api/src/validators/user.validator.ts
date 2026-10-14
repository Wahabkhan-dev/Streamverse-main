import { z } from "zod";

/**
 * Editable profile fields only. "role", "status", "emailVerified", "email" and "passwordHash" are
 * deliberately absent — Zod strips anything else, so submitting them through this endpoint has no effect.
 */
export const profileUpdateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120),
    avatarUrl: z.url().max(2048).nullable(),
    country: z.string().trim().length(2).toUpperCase().nullable(),
    preferredLanguage: z.string().trim().min(2).max(35).nullable(),
    subtitleLanguage: z.string().trim().min(2).max(35).nullable(),
    audioLanguage: z.string().trim().min(2).max(35).nullable(),
    videoQuality: z.enum(["Auto", "SD", "HD", "4K"]).nullable(),
    audiobookSpeed: z.number().min(0.5).max(3).nullable(),
  })
  .partial();
