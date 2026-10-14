import { z } from "zod";
import { listQuery } from "../utils/pagination";

/**
 * Section 11: Admin links an EXISTING Stripe Price id rather than StreamVerse minting Product/Price
 * objects on Admin's behalf — simpler, avoids the backend needing Stripe Product-catalog write access
 * beyond what's already used for Customers/Subscriptions/Refunds, and keeps Stripe's dashboard as the
 * one place pricing is actually authored. `priceAmount`/`currency` are still stored locally (Section 9)
 * so the customer-facing list and checkout never need a live Stripe call just to show a price.
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
  stripePriceId: z.string().min(1),
  priceAmount: z.number().int().min(0),
  currency: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{3}$/, "Use a 3-letter ISO currency code"),
  billingInterval: z.enum(["MONTHLY", "YEARLY"]),
  trialDays: z.number().int().min(0).max(365).optional(),
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
