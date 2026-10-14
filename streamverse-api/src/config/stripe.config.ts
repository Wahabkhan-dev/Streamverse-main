import { env } from "./env";

/**
 * Phase 7 (Section 2/3): the one place that reads Stripe-related env vars. `apiVersion` is pinned to
 * exactly what the installed `stripe` SDK version expects — never left to drift to whatever Stripe's
 * account-level default happens to be.
 */
export const stripeConfig = {
  secretKey: env.STRIPE_SECRET_KEY,
  webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  successUrl: env.STRIPE_SUCCESS_URL,
  cancelUrl: env.STRIPE_CANCEL_URL,
  portalReturnUrl: env.STRIPE_PORTAL_RETURN_URL,
  apiVersion: "2026-09-30.endive" as const,
};
