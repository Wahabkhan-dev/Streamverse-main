import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import type { SubscriptionStatus } from "@prisma/client";
import { logger } from "../../config/logger";
import * as planRepository from "../../repositories/plan.repository";
import * as subscriptionRepository from "../../repositories/subscription.repository";
import * as userRepository from "../../repositories/user.repository";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors";
import { buildPagination, toSkipTake } from "../../utils/pagination";
import type { AuditContext } from "../auditLog.service";
import { recordAudit } from "../auditLog.service";
import { createNotification } from "../notification.service";
import * as stripeService from "../stripe/stripe.service";
import { resolveActivePlanOrThrow, toCustomerPlan } from "./plan.service";
import { statusGrantsAccess } from "./subscriptionAccess.service";
import { getOrCreateStripeCustomer } from "./stripeCustomer.service";
import { getDefaultPaymentMethodSummary } from "./paymentMethod.service";
import * as entitlementCache from "../entitlement/entitlementCache.service";

const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

const STRIPE_TO_LOCAL_STATUS: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  incomplete: "INCOMPLETE",
  incomplete_expired: "INCOMPLETE_EXPIRED",
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  unpaid: "UNPAID",
  paused: "PAUSED",
};

function toDate(unixSeconds: number | null | undefined): Date | null {
  return unixSeconds ? new Date(unixSeconds * 1000) : null;
}

/** The current period dates live on the subscription ITEM in recent Stripe API versions, not the subscription root. */
function periodDates(stripeSub: Stripe.Subscription): { start: Date | null; end: Date | null } {
  const item = stripeSub.items.data[0];
  return { start: toDate(item?.current_period_start), end: toDate(item?.current_period_end) };
}

// Statuses that must never be overwritten by an older, out-of-order Stripe event.
const TERMINAL_STATUSES: SubscriptionStatus[] = ["CANCELED", "INCOMPLETE_EXPIRED", "UNPAID"];

/**
 * Section 62/65/67: the single place a Stripe Subscription object becomes the local row — called both
 * right after a direct API call (checkout/cancel/resume/change-plan all get the updated object back
 * synchronously) and from the webhook handlers. Always re-derives from the Stripe object's OWN fields.
 *
 * Keyed on stripeSubscriptionId (not userId) so that a user's second subscription never collides with
 * events for their first, and so an older ACTIVE event cannot overwrite a CANCELED row.
 */
export async function applyStripeSubscriptionSnapshot(stripeSub: Stripe.Subscription): Promise<void> {
  const priceId = stripeSub.items.data[0]?.price.id;
  if (!priceId) throw new Error(`Stripe subscription ${stripeSub.id} has no price on its first item`);
  const planId = await resolvePlanIdForPrice(priceId);
  if (!planId) throw new Error(`No Plan is linked to Stripe price ${priceId} — cannot sync subscription ${stripeSub.id}`);
  const plan = await planRepository.findById(planId);
  if (!plan) throw new Error(`No Plan is linked to Stripe price ${priceId} — cannot sync subscription ${stripeSub.id}`);

  const userId = await resolveUserId(stripeSub);
  if (!userId) throw new Error(`Could not resolve a StreamVerse user for Stripe subscription ${stripeSub.id}`);

  const incomingStatus = STRIPE_TO_LOCAL_STATUS[stripeSub.status]!;
  const existing = await subscriptionRepository.findByStripeSubscriptionId(stripeSub.id);

  // Guard: never regress from a terminal state via a late/out-of-order event.
  // (e.g. a delayed ACTIVE snapshot must not restore access after a CANCELED event was processed)
  if (existing && TERMINAL_STATUSES.includes(existing.status) && !TERMINAL_STATUSES.includes(incomingStatus)) {
    logger.warn({ stripeSubscriptionId: stripeSub.id, existing: existing.status, incoming: incomingStatus }, "subscription: ignoring out-of-order event that would regress terminal state");
    return;
  }

  const { start, end } = periodDates(stripeSub);
  const data = {
    userId,
    planId: plan.id,
    stripeCustomerId: typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id,
    stripeSubscriptionId: stripeSub.id,
    stripePriceId: priceId,
    status: incomingStatus,
    currentPeriodStart: start,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    canceledAt: toDate(stripeSub.canceled_at),
    trialEnd: toDate(stripeSub.trial_end),
  };
  await subscriptionRepository.upsertByStripeSubscriptionId(stripeSub.id, data, data);
  entitlementCache.invalidateUser(userId);
}

async function resolvePlanIdForPrice(stripePriceId: string): Promise<string | undefined> {
  const plans = await planRepository.listAll();
  return plans.find((p) => p.stripePriceId === stripePriceId)?.id;
}

async function resolveUserId(stripeSub: Stripe.Subscription): Promise<string | undefined> {
  const metaUserId = stripeSub.metadata?.["streamVerseUserId"];
  if (metaUserId) return metaUserId;
  const customerId = typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;
  const existing = await subscriptionRepository.findByStripeSubscriptionId(stripeSub.id);
  if (existing) return existing.userId;
  const user = await userRepository.findByStripeCustomerId(customerId);
  return user?.id;
}

/** Section 67: customer.subscription.deleted — status moves to CANCELED regardless of what it was before. */
export async function markCanceledByStripeSubscriptionId(stripeSubscriptionId: string): Promise<void> {
  const existing = await subscriptionRepository.findByStripeSubscriptionId(stripeSubscriptionId);
  if (!existing) return; // nothing local to reconcile — safe no-op
  await subscriptionRepository.update(existing.id, { status: "CANCELED", canceledAt: new Date() });
  entitlementCache.invalidateUser(existing.userId);
  await createNotification(existing.userId, "SUBSCRIPTION", "Subscription canceled", "Your subscription has ended.");
}

export function toSubscriptionView(
  sub: {
    status: SubscriptionStatus;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    canceledAt: Date | null;
    trialEnd: Date | null;
    plan: Parameters<typeof toCustomerPlan>[0];
  } | null,
  defaultPaymentMethod: Awaited<ReturnType<typeof getDefaultPaymentMethodSummary>>,
) {
  if (!sub) {
    return { plan: null, status: null, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, canceledAt: null, trialEnd: null, defaultPaymentMethod, allowedActions: ["checkout"] };
  }
  const active = statusGrantsAccess(sub.status);
  const allowedActions: string[] = [];
  if (active && !sub.cancelAtPeriodEnd) allowedActions.push("cancel", "changePlan");
  if (active && sub.cancelAtPeriodEnd) allowedActions.push("resume");
  if (!active) allowedActions.push("checkout");

  return {
    plan: toCustomerPlan(sub.plan),
    status: sub.status,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    canceledAt: sub.canceledAt,
    trialEnd: sub.trialEnd,
    defaultPaymentMethod,
    allowedActions,
  };
}

export async function getMySubscription(userId: string) {
  const [sub, defaultPaymentMethod] = await Promise.all([subscriptionRepository.findByUserId(userId), getDefaultPaymentMethodSummary(userId)]);
  return toSubscriptionView(sub, defaultPaymentMethod);
}

/** Section 16/17/76/77: validates the plan, refuses a duplicate active subscription, and lets Stripe control every billing value. */
export async function createCheckoutSession(userId: string, planId: string, ctx: AuditContext = NO_ACTOR) {
  const plan = await resolveActivePlanOrThrow(planId);
  const existing = await subscriptionRepository.findByUserId(userId);
  if (existing && statusGrantsAccess(existing.status)) {
    throw new ConflictError("You already have an active subscription. Use change-plan to switch plans instead.");
  }

  const stripeCustomerId = await getOrCreateStripeCustomer(userId);
  // Deterministic key: same user+plan within a short window produces the same Stripe session
  // instead of spawning two billable subscriptions on a double-click.
  const windowMinute = Math.floor(Date.now() / 60_000);
  const session = await stripeService.createCheckoutSession({ stripeCustomerId, priceId: plan.stripePriceId, userId, planId: plan.id, idempotencyKey: `checkout-${userId}-${plan.id}-${windowMinute}` });

  await recordAudit(ctx, { action: "subscription.checkout_created", entityType: "SUBSCRIPTION", entityId: userId, metadata: { planId: plan.id } });
  return { checkoutUrl: session.url, sessionId: session.id };
}

async function requireActiveSubscription(userId: string) {
  const sub = await subscriptionRepository.findByUserId(userId);
  if (!sub) throw new NotFoundError("No subscription found");
  return sub;
}

/** Section 39/40: cancel-at-period-end is the only mode exposed — never immediate cancellation. */
export async function cancelSubscription(userId: string, ctx: AuditContext = NO_ACTOR) {
  const sub = await requireActiveSubscription(userId);
  if (sub.status === "CANCELED") throw new ConflictError("This subscription is already canceled.");
  if (sub.cancelAtPeriodEnd) return toSubscriptionView(sub, await getDefaultPaymentMethodSummary(userId)); // idempotent

  const updated = await stripeService.setSubscriptionCancelAtPeriodEnd(sub.stripeSubscriptionId, true, `cancel-${sub.id}-${randomUUID()}`);
  await applyStripeSubscriptionSnapshot(updated);
  await createNotification(userId, "SUBSCRIPTION", "Cancellation scheduled", "Your subscription will end at the close of your current billing period.");
  await recordAudit(ctx, { action: "subscription.cancel_requested", entityType: "SUBSCRIPTION", entityId: sub.id });
  return getMySubscription(userId);
}

/** Section 41: only valid while cancelAtPeriodEnd is true and the period hasn't actually ended yet. */
export async function resumeSubscription(userId: string, ctx: AuditContext = NO_ACTOR) {
  const sub = await requireActiveSubscription(userId);
  if (!sub.cancelAtPeriodEnd) throw new ConflictError("This subscription is not scheduled for cancellation.");
  if (sub.currentPeriodEnd && sub.currentPeriodEnd < new Date()) throw new ConflictError("This subscription's period has already ended — start a new checkout instead.");

  const updated = await stripeService.setSubscriptionCancelAtPeriodEnd(sub.stripeSubscriptionId, false, `resume-${sub.id}-${randomUUID()}`);
  await applyStripeSubscriptionSnapshot(updated);
  await createNotification(userId, "SUBSCRIPTION", "Subscription resumed", "Your subscription will continue renewing as normal.");
  await recordAudit(ctx, { action: "subscription.resumed", entityType: "SUBSCRIPTION", entityId: sub.id });
  return getMySubscription(userId);
}

/** Section 42/43/44: explicit proration policy (`create_prorations`, in stripe.service.ts) — Stripe computes the actual amounts, never this backend. */
export async function changePlan(userId: string, planId: string, ctx: AuditContext = NO_ACTOR) {
  const sub = await requireActiveSubscription(userId);
  if (!statusGrantsAccess(sub.status)) throw new ConflictError("Start a new checkout instead of changing a plan with no active subscription.");
  const newPlan = await resolveActivePlanOrThrow(planId);
  if (newPlan.id === sub.planId) throw new ConflictError("You are already on this plan.");

  const current = await stripeService.retrieveSubscription(sub.stripeSubscriptionId);
  const itemId = current.items.data[0]?.id;
  if (!itemId) throw new ValidationError([{ path: "planId", message: "This subscription has no billable item to change." }]);

  const updated = await stripeService.changeSubscriptionPrice(sub.stripeSubscriptionId, itemId, newPlan.stripePriceId, `change-plan-${sub.id}-${randomUUID()}`);
  await applyStripeSubscriptionSnapshot(updated);
  await createNotification(userId, "SUBSCRIPTION", "Plan changed", `Your subscription is now on the ${newPlan.name} plan.`);
  await recordAudit(ctx, { action: "subscription.plan_changed", entityType: "SUBSCRIPTION", entityId: sub.id, metadata: { fromPlanId: sub.planId, toPlanId: newPlan.id } });
  return getMySubscription(userId);
}

export async function createBillingPortalSession(userId: string, ctx: AuditContext = NO_ACTOR) {
  const stripeCustomerId = await getOrCreateStripeCustomer(userId);
  const session = await stripeService.createBillingPortalSession(stripeCustomerId);
  await recordAudit(ctx, { action: "billing.portal_session_created", entityType: "USER", entityId: userId });
  return { url: session.url };
}

/* ---------------------------------------------------------------- admin (Section 49/50) */

export interface AdminSubscriptionFilters {
  page: number;
  limit: number;
  status?: SubscriptionStatus | undefined;
  planId?: string | undefined;
  search?: string | undefined;
}

export async function adminListSubscriptions(filters: AdminSubscriptionFilters) {
  const where = subscriptionRepository.adminListWhere(filters);
  const { skip, take } = toSkipTake(filters.page, filters.limit);
  const { rows, total } = await subscriptionRepository.adminList(where, skip, take);
  return { rows, pagination: buildPagination(total, filters.page, filters.limit) };
}

export async function adminGetSubscription(id: string) {
  const sub = await subscriptionRepository.findById(id);
  if (!sub) throw new NotFoundError("Subscription not found");
  return sub;
}
