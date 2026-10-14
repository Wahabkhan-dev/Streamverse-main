import type Stripe from "stripe";
import { logger } from "../../config/logger";
import * as stripeService from "../stripe/stripe.service";
import { applyStripeRefundEvent } from "./refund.service";
import { recordPaymentFailureFromInvoice, recordPaymentFromInvoice } from "./payment.service";
import { applyStripeSubscriptionSnapshot, markCanceledByStripeSubscriptionId } from "./subscription.service";

/**
 * Section 22/23: one dispatcher, one handler per event type — never a giant switch statement with
 * business logic written directly in the controller. An event type not in this map is recorded
 * (Section 21's StripeEvent row) with status IGNORED rather than silently dropped or treated as an error.
 */
const HANDLERS: Partial<Record<Stripe.Event.Type, (event: Stripe.Event) => Promise<void>>> = {
  "checkout.session.completed": async (event) => {
    const session = event.data.object as Stripe.Checkout.Session;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (!subscriptionId) return; // not a subscription-mode checkout — nothing to sync
    const subscription = await stripeService.retrieveSubscription(subscriptionId);
    await applyStripeSubscriptionSnapshot(subscription);
  },
  "customer.subscription.created": async (event) => applyStripeSubscriptionSnapshot(event.data.object as Stripe.Subscription),
  "customer.subscription.updated": async (event) => applyStripeSubscriptionSnapshot(event.data.object as Stripe.Subscription),
  "customer.subscription.deleted": async (event) => markCanceledByStripeSubscriptionId((event.data.object as Stripe.Subscription).id),
  "invoice.paid": async (event) => recordPaymentFromInvoice(event.data.object as Stripe.Invoice),
  "invoice.payment_failed": async (event) => recordPaymentFailureFromInvoice(event.data.object as Stripe.Invoice),
  "payment_intent.succeeded": async () => undefined, // Section 22: invoice.paid already records the Payment for subscription billing; nothing extra to do here
  "payment_intent.payment_failed": async () => undefined, // likewise covered by invoice.payment_failed for subscription billing
  "charge.refunded": async (event) => {
    const charge = event.data.object as Stripe.Charge;
    for (const refund of charge.refunds?.data ?? []) await applyStripeRefundEvent(refund);
  },
  "setup_intent.succeeded": async () => undefined, // the payment method is already attached via Stripe Elements by this point
  "payment_method.attached": async () => undefined, // no local state keyed off this directly — payment methods are always read live from Stripe
};

export async function dispatch(event: Stripe.Event): Promise<"PROCESSED" | "IGNORED"> {
  const handler = HANDLERS[event.type];
  if (!handler) {
    logger.info({ eventType: event.type }, "stripe webhook: no handler for this event type (recorded, not acted on)");
    return "IGNORED";
  }
  await handler(event);
  return "PROCESSED";
}
