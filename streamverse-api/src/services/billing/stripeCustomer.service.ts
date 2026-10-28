import * as userRepository from "../../repositories/user.repository";
import * as stripeService from "../stripe/stripe.service";
import { NotFoundError } from "../../utils/errors";
import { logger } from "../../config/logger";

/**
 * Phase 7 (Section 5/6): lazy creation — a Stripe Customer is created the first time a user takes a
 * billing action (Section 6's preferred strategy), never at registration. Re-reads the user row right
 * before creating so a second concurrent call (two tabs, a retry) finds the id the first call just wrote
 * and reuses it instead of creating a duplicate Stripe Customer; uses a conditional update so that if two
 * requests race past the initial null-check, only one wins and the other discards its newly-created orphan.
 */
export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError("User not found");
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripeService.createCustomer(user.email, user.id);

  // Conditional update: only sets stripeCustomerId if it's still null (race-safe)
  const result = await userRepository.setStripeCustomerIdIfNull(user.id, customer.id);
  if (result.count === 0) {
    // Another request won the race — fetch the canonical customer ID it stored
    const updated = await userRepository.findById(userId);
    if (updated?.stripeCustomerId) {
      // Best-effort cleanup of the orphan we just created. Stripe replays one customer for both racing calls (same
      // idempotency key), so when the ids match this IS the winner's customer and must not be deleted.
      if (customer.id !== updated.stripeCustomerId) {
        try {
          await stripeService.deleteCustomer(customer.id);
        } catch (err) {
          logger.warn({ stripeCustomerId: customer.id, userId, err }, "stripeCustomer: failed to delete orphaned Stripe customer after race");
        }
      }
      return updated.stripeCustomerId;
    }
    throw new Error("Failed to set Stripe customer ID after race condition");
  }

  return customer.id;
}
