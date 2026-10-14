import Stripe from "stripe";
import { stripeConfig } from "../../config/stripe.config";

let instance: Stripe | undefined;

/** The one Stripe client in the whole codebase (Section 2) — everything else goes through `stripe.service.ts`. */
export function getStripeClient(): Stripe {
  instance ??= new Stripe(stripeConfig.secretKey, { apiVersion: stripeConfig.apiVersion });
  return instance;
}
