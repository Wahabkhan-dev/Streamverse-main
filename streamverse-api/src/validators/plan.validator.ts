import { z } from "zod";
import { listQuery } from "../utils/pagination";

/**
 * Admin sets the price (amount + currency + interval) and StreamVerse creates the matching Stripe Product/Price itself
 * (see plan.service.ts), so nothing needs authoring in the Stripe dashboard. `stripePriceId` stays optional for linking an
 * existing Stripe Price instead. `priceAmount`/`currency` are always stored locally so the customer-facing list and
 * checkout never need a live Stripe call just to show a price.
 */
export const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens"),
  description: z.string().max(1000).optional(),
  stripeProductId: z.string().min(1).optional(),
  stripePriceId: z.string().min(1).optional(),
  priceAmount: z.number().int().min(0),
  currency: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{3}$/, "Use a 3-letter ISO currency code"),
  billingInterval: z.enum(["MONTHLY", "YEARLY"]),
  trialDays: z.number().int().min(0).max(365).optional(),
  /** null = unlimited */
  maxDevices: z.number().int().min(1).max(100).nullable().optional(),
  /** null = unlimited */
  maxConcurrentStreams: z.number().int().min(1).max(100).nullable().optional(),
  /** null = unrestricted */
  maxVideoQuality: z.enum(["480p", "720p", "1080p", "4K"]).nullable().optional(),
  moviesEnabled: z.boolean().optional(),
  ebooksEnabled: z.boolean().optional(),
  audiobooksEnabled: z.boolean().optional(),
  features: z.array(z.string().trim().min(1)).max(30).default([]),
  active: z.boolean().default(true),
  displayOrder: z.number().int().min(0).default(0),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = createPlanSchema.partial();
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const planListQuerySchema = listQuery(["displayOrder", "name", "createdAt"] as const, "displayOrder").extend({
  active: z.coerce.boolean().optional(),
});
