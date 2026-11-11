import Stripe from "stripe";
import { stripeConfig } from "../../config/stripe.config";
import { ERROR_CODES } from "../../constants/errors";
import { AppError } from "../../utils/errors";

let instance: Stripe | undefined;

/** The one Stripe client in the whole codebase (Section 2) — everything else goes through `stripe.service.ts`. */
export function getStripeClient(): Stripe {
  if (!stripeConfig.secretKey) throw new AppError("Billing is not configured", 503, ERROR_CODES.SERVICE_UNAVAILABLE);
  // The SDK's default timeout is 80 s: a stalled Stripe would hold a customer's request (and a connection) that long. 20 s is
  // ample for any single Stripe call; 2 network retries are safe because the SDK adds an idempotency key to retried POSTs.
  instance ??= new Stripe(stripeConfig.secretKey, { apiVersion: stripeConfig.apiVersion, timeout: 20_000, maxNetworkRetries: 2 });
  return instance;
}
