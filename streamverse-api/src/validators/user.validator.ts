import { z } from "zod";

/**
 * Editable profile fields only. "role", "status", "emailVerified", "email" and "passwordHash" are
 * deliberately absent — Zod strips anything else, so submitting them through this endpoint has no effect.
 */
export const profileUpdateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120),
    // an https address, or the small photo the customer uploaded (data URL, a few tens of KB at most)
    avatarUrl: z
      .union([z.url().max(2048).regex(/^https?:\/\//), z.string().max(150_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)])
      .nullable(),
    accentColor: z.number().int().min(0).max(5).nullable(),
    country: z.string().trim().length(2).toUpperCase().nullable(),
    preferredLanguage: z.string().trim().min(2).max(35).nullable(),
    subtitleLanguage: z.string().trim().min(2).max(35).nullable(),
    audioLanguage: z.string().trim().min(2).max(35).nullable(),
    videoQuality: z.enum(["Auto", "SD", "HD", "4K", "1080p", "720p", "480p"]).nullable(),
    audiobookSpeed: z.number().min(0.5).max(3).nullable(),
  })
  .partial();
