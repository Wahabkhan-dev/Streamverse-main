import type Stripe from "stripe";
import { stripeConfig } from "../../config/stripe.config";
import { getStripeClient } from "./stripeClient";

/**
 * Phase 7 (Section 2/23): the ONLY module that calls the Stripe SDK. Every billing service
 * (`subscription.service.ts`, `paymentMethod.service.ts`, `refund.service.ts`, the webhook handlers, ...)
 * goes through these named functions — never `getStripeClient()` directly. This is also the one seam
 * tests `vi.mock` to avoid a real network call to Stripe (the same pattern Phase 6 used for storage/ffmpeg).
 */

export async function createCustomer(email: string, userId: string): Promise<Stripe.Customer> {
  // Section 7: safe metadata only — never anything sensitive.
  return getStripeClient().customers.create({ email, metadata: { streamVerseUserId: userId } }, { idempotencyKey: `customer-create-${userId}` });
}

export async function retrieveCustomer(stripeCustomerId: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
  return getStripeClient().customers.retrieve(stripeCustomerId);
}

export async function updateCustomerDefaultPaymentMethod(stripeCustomerId: string, paymentMethodId: string): Promise<Stripe.Customer> {
  return getStripeClient().customers.update(stripeCustomerId, { invoice_settings: { default_payment_method: paymentMethodId } });
}

export async function createSetupIntent(stripeCustomerId: string, idempotencyKey: string): Promise<Stripe.SetupIntent> {
  return getStripeClient().setupIntents.create({ customer: stripeCustomerId, usage: "off_session", allowed_payment_method_types: ["card"] }, { idempotencyKey });
}

export async function listPaymentMethods(stripeCustomerId: string): Promise<Stripe.PaymentMethod[]> {
  const result = await getStripeClient().paymentMethods.list({ customer: stripeCustomerId, type: "card" });
  return result.data;
}

export async function retrievePaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
  return getStripeClient().paymentMethods.retrieve(paymentMethodId);
}

export async function detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
  return getStripeClient().paymentMethods.detach(paymentMethodId);
}

export async function createCheckoutSession(params: { stripeCustomerId: string; priceId: string; userId: string; planId: string; popup?: boolean; idempotencyKey: string }): Promise<Stripe.Checkout.Session> {
  return getStripeClient().checkout.sessions.create(
    {
      customer: params.stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: `${stripeConfig.successUrl}?session_id={CHECKOUT_SESSION_ID}${params.popup ? "&popup=1" : ""}`,
      cancel_url: stripeConfig.cancelUrl,
      subscription_data: { metadata: { streamVerseUserId: params.userId, streamVersePlanId: params.planId } },
      metadata: { streamVerseUserId: params.userId, streamVersePlanId: params.planId },
    },
    { idempotencyKey: params.idempotencyKey },
  );
}

/**
 * A subscription that starts "incomplete" and is paid from an embedded payment box (Stripe Elements) on our own page:
 * the first invoice carries the client secret the browser confirms with Stripe.js. The card is saved as the default
 * payment method once the payment succeeds.
 */
export async function createSubscriptionForEmbeddedPayment(params: { stripeCustomerId: string; priceId: string; userId: string; planId: string; idempotencyKey: string }): Promise<Stripe.Subscription> {
  return getStripeClient().subscriptions.create(
    {
      customer: params.stripeCustomerId,
      items: [{ price: params.priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription", payment_method_types: ["card"] },
      expand: ["latest_invoice.confirmation_secret"],
      metadata: { streamVerseUserId: params.userId, streamVersePlanId: params.planId },
    },
    { idempotencyKey: params.idempotencyKey },
  );
}

export async function listCustomerSubscriptions(stripeCustomerId: string): Promise<Stripe.Subscription[]> {
  return (await getStripeClient().subscriptions.list({ customer: stripeCustomerId, status: "all", limit: 10 })).data;
}

export async function cancelSubscriptionNow(stripeSubscriptionId: string): Promise<void> {
  await getStripeClient().subscriptions.cancel(stripeSubscriptionId);
}

export async function createBillingPortalSession(stripeCustomerId: string): Promise<Stripe.BillingPortal.Session> {
  return getStripeClient().billingPortal.sessions.create({ customer: stripeCustomerId, return_url: stripeConfig.portalReturnUrl ?? stripeConfig.cancelUrl });
}

export async function retrieveSubscription(stripeSubscriptionId: string): Promise<Stripe.Subscription> {
  return getStripeClient().subscriptions.retrieve(stripeSubscriptionId);
}

export async function setSubscriptionCancelAtPeriodEnd(stripeSubscriptionId: string, cancelAtPeriodEnd: boolean, idempotencyKey: string): Promise<Stripe.Subscription> {
  return getStripeClient().subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: cancelAtPeriodEnd }, { idempotencyKey });
}

/** Section 42/43: proration policy is explicit here (`create_prorations`), never left to Stripe's default-by-accident. */
export async function changeSubscriptionPrice(stripeSubscriptionId: string, subscriptionItemId: string, newPriceId: string, idempotencyKey: string): Promise<Stripe.Subscription> {
  return getStripeClient().subscriptions.update(
    stripeSubscriptionId,
    { items: [{ id: subscriptionItemId, price: newPriceId }], proration_behavior: "create_prorations" },
    { idempotencyKey },
  );
}

export async function retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  return getStripeClient().paymentIntents.retrieve(paymentIntentId);
}

export async function createRefund(params: { paymentIntentId: string; amount?: number; reason?: string; idempotencyKey: string }): Promise<Stripe.Refund> {
  return getStripeClient().refunds.create(
    { payment_intent: params.paymentIntentId, ...(params.amount !== undefined ? { amount: params.amount } : {}), ...(params.reason ? { reason: mapRefundReason(params.reason) } : {}) },
    { idempotencyKey: params.idempotencyKey },
  );
}

function mapRefundReason(reason: string): Stripe.RefundCreateParams.Reason | undefined {
  const allowed: Stripe.RefundCreateParams.Reason[] = ["duplicate", "fraudulent", "requested_by_customer"];
  return (allowed as string[]).includes(reason) ? (reason as Stripe.RefundCreateParams.Reason) : "requested_by_customer";
}

/** Deletes a Stripe Customer — used only to clean up orphaned customers created by a lost race condition. */
export async function deleteCustomer(stripeCustomerId: string): Promise<void> {
  await getStripeClient().customers.del(stripeCustomerId);
}

/** Section 19/20: verifies the Stripe-Signature header against the RAW body — never a parsed/re-stringified one. */
export function constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  return getStripeClient().webhooks.constructEvent(rawBody, signature, stripeConfig.webhookSecret);
}
