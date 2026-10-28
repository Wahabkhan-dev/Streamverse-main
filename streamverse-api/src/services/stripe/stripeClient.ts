import Stripe from "stripe";
import { stripeConfig } from "../../config/stripe.config";
import { ERROR_CODES } from "../../constants/errors";
import { AppError } from "../../utils/errors";

let instance: Stripe | undefined;

/** The one Stripe client in the whole codebase (Section 2) — everything else goes through `stripe.service.ts`. */
export function getStripeClient(): Stripe {
  if (!stripeConfig.secretKey) throw new AppError("Billing is not configured", 503, ERROR_CODES.SERVICE_UNAVAILABLE);
  instance ??= new Stripe(stripeConfig.secretKey, { apiVersion: stripeConfig.apiVersion });
  return instance;
}
