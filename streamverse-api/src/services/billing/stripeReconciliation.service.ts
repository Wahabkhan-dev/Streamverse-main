import * as subscriptionRepository from "../../repositories/subscription.repository";
import * as userRepository from "../../repositories/user.repository";
import { NotFoundError } from "../../utils/errors";
import { logger } from "../../config/logger";
import * as stripeService from "../stripe/stripe.service";
import { applyStripeSubscriptionSnapshot } from "./subscription.service";

/**
 * Section 86/87/89: protects against a missed webhook or a Stripe-succeeded-but-DB-failed write (Section
 * 86 — "design for eventual consistency") by re-pulling the latest state directly from Stripe and
 * re-applying it through the exact same snapshot function the webhooks use.
 */
export async function reconcileUser(userId: string): Promise<{ reconciled: boolean; reason?: string }> {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError("User not found");
  if (!user.stripeCustomerId) return { reconciled: false, reason: "No Stripe customer yet" };

  const local = await subscriptionRepository.findByUserId(userId);
  if (!local) return { reconciled: false, reason: "No local subscription to reconcile" };

  const latest = await stripeService.retrieveSubscription(local.stripeSubscriptionId);
  await applyStripeSubscriptionSnapshot(latest);
  logger.info({ userId, stripeSubscriptionId: latest.id }, "billing: reconciled subscription from Stripe");
  return { reconciled: true };
}
