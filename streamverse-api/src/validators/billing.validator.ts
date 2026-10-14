import { z } from "zod";
import { listQuery } from "../utils/pagination";

/** Section 17: planId only — amount/currency/price are NEVER accepted from the frontend. */
export const checkoutSchema = z.object({ planId: z.string().min(1) });
export const changePlanSchema = z.object({ planId: z.string().min(1) });

/** Section 55: amount is optional (full refund) and, when present, validated against the remaining refundable amount server-side — never trusted blindly. */
export const refundSchema = z.object({ amount: z.number().int().min(1).optional(), reason: z.string().trim().max(200).optional() });

export const billingHistoryQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });

export const adminSubscriptionListQuerySchema = listQuery(["createdAt", "status"] as const, "createdAt").extend({
  status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "UNPAID", "CANCELED", "INCOMPLETE", "INCOMPLETE_EXPIRED", "PAUSED"]).optional(),
  planId: z.string().optional(),
  search: z.string().trim().max(200).optional(),
});

export const adminPaymentListQuerySchema = listQuery(["createdAt"] as const, "createdAt").extend({
  status: z.enum(["PENDING", "SUCCEEDED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"]).optional(),
  currency: z.string().trim().toLowerCase().length(3).optional(),
  userId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
