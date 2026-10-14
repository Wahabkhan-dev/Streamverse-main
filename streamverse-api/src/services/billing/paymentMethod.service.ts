import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import * as subscriptionRepository from "../../repositories/subscription.repository";
import * as userRepository from "../../repositories/user.repository";
import * as stripeService from "../stripe/stripe.service";
import { ConflictError, ForbiddenError, NotFoundError } from "../../utils/errors";
import type { AuditContext } from "../auditLog.service";
import { recordAudit } from "../auditLog.service";
import { statusGrantsAccess } from "./subscriptionAccess.service";
import { getOrCreateStripeCustomer } from "./stripeCustomer.service";

const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

/** Section 28: safe display fields only — Stripe is the payment-instrument authority, never StreamVerse. */
function toSafePaymentMethod(pm: Stripe.PaymentMethod, defaultId: string | null) {
  return {
    id: pm.id,
    brand: pm.card?.brand ?? null,
    last4: pm.card?.last4 ?? null,
    expMonth: pm.card?.exp_month ?? null,
    expYear: pm.card?.exp_year ?? null,
    isDefault: pm.id === defaultId,
  };
}

async function requireStripeCustomerId(userId: string): Promise<string> {
  const user = await userRepository.findById(userId);
  if (!user?.stripeCustomerId) throw new NotFoundError("No billing profile yet — add a payment method first.");
  return user.stripeCustomerId;
}

async function defaultPaymentMethodId(stripeCustomerId: string): Promise<string | null> {
  const customer = await stripeService.retrieveCustomer(stripeCustomerId);
  if (customer.deleted) return null;
  const def = customer.invoice_settings?.default_payment_method;
  return typeof def === "string" ? def : def?.id ?? null;
}

/** Section 29: never a raw card number through this backend — only a SetupIntent clientSecret for Stripe Elements. */
export async function createSetupIntent(userId: string, ctx: AuditContext = NO_ACTOR) {
  const stripeCustomerId = await getOrCreateStripeCustomer(userId);
  const intent = await stripeService.createSetupIntent(stripeCustomerId, `setup-intent-${userId}-${randomUUID()}`);
  await recordAudit(ctx, { action: "billing.setup_intent_created", entityType: "USER", entityId: userId });
  return { clientSecret: intent.client_secret };
}

export async function listPaymentMethods(userId: string) {
  const stripeCustomerId = await requireStripeCustomerId(userId);
  const [methods, defaultId] = await Promise.all([stripeService.listPaymentMethods(stripeCustomerId), defaultPaymentMethodId(stripeCustomerId)]);
  return methods.map((m) => toSafePaymentMethod(m, defaultId));
}

/** Section 36: verifies the payment method actually belongs to THIS user's Stripe Customer before any read/write. */
async function assertOwnedByUser(userId: string, paymentMethodId: string): Promise<{ stripeCustomerId: string; paymentMethod: Stripe.PaymentMethod }> {
  const stripeCustomerId = await requireStripeCustomerId(userId);
  const paymentMethod = await stripeService.retrievePaymentMethod(paymentMethodId).catch(() => null);
  if (!paymentMethod || paymentMethod.customer !== stripeCustomerId) throw new ForbiddenError("This payment method does not belong to your account.");
  return { stripeCustomerId, paymentMethod };
}

export async function setDefaultPaymentMethod(userId: string, paymentMethodId: string, ctx: AuditContext = NO_ACTOR) {
  const { stripeCustomerId } = await assertOwnedByUser(userId, paymentMethodId);
  await stripeService.updateCustomerDefaultPaymentMethod(stripeCustomerId, paymentMethodId);
  await recordAudit(ctx, { action: "billing.default_payment_method_changed", entityType: "USER", entityId: userId, metadata: { paymentMethodId } });
  return listPaymentMethods(userId);
}

/**
 * Section 33/34/35: removing the current DEFAULT method is refused (409) while an active/trialing
 * subscription exists AND no other payment method is available to fall back to — billing would
 * otherwise be left with no usable method. Removing a non-default method, or removing the default when
 * another method exists (Stripe/the customer can set a new default first) or there is no paid
 * subscription to protect, is always allowed.
 */
export async function removePaymentMethod(userId: string, paymentMethodId: string, ctx: AuditContext = NO_ACTOR) {
  const { stripeCustomerId } = await assertOwnedByUser(userId, paymentMethodId);
  const [defaultId, allMethods, subscription] = await Promise.all([
    defaultPaymentMethodId(stripeCustomerId),
    stripeService.listPaymentMethods(stripeCustomerId),
    subscriptionRepository.findByUserId(userId),
  ]);

  const isDefault = paymentMethodId === defaultId;
  const isLastMethod = allMethods.length <= 1;
  const subscriptionNeedsAMethod = !!subscription && statusGrantsAccess(subscription.status);

  if (isDefault && isLastMethod && subscriptionNeedsAMethod) {
    throw new ConflictError("Add another payment method before removing this one — your subscription needs a valid payment method on file.");
  }

  await stripeService.detachPaymentMethod(paymentMethodId);
  await recordAudit(ctx, { action: "billing.payment_method_removed", entityType: "USER", entityId: userId, metadata: { paymentMethodId } });
  return listPaymentMethods(userId);
}

export async function getDefaultPaymentMethodSummary(userId: string) {
  const user = await userRepository.findById(userId);
  if (!user?.stripeCustomerId) return null;
  const defaultId = await defaultPaymentMethodId(user.stripeCustomerId);
  if (!defaultId) return null;
  const pm = await stripeService.retrievePaymentMethod(defaultId).catch(() => null);
  return pm ? toSafePaymentMethod(pm, defaultId) : null;
}
