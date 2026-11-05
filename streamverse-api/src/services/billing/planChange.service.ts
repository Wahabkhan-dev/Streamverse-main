import * as planRepository from "../../repositories/plan.repository";
import * as subscriptionRepository from "../../repositories/subscription.repository";
import { ConflictError, NotFoundError } from "../../utils/errors";
import * as stripeService from "../stripe/stripe.service";
import { getOrCreateStripeCustomer } from "./stripeCustomer.service";
import { getDefaultPaymentMethodSummary } from "./paymentMethod.service";
import { resolveActivePlanOrThrow } from "./plan.service";
import { statusGrantsAccess } from "./subscriptionAccess.service";

type PlanLike = { id: string; name: string; priceAmount: number; currency: string; billingInterval: string };

const perMonth = (p: PlanLike) => (p.billingInterval === "YEARLY" ? p.priceAmount / 12 : p.priceAmount);
export const isUpgradeBetween = (from: PlanLike, to: PlanLike) => perMonth(to) > perMonth(from);

const summary = (p: PlanLike) => ({ id: p.id, name: p.name, priceAmount: p.priceAmount, currency: p.currency, billingInterval: p.billingInterval });

/**
 * What a plan change will do to the customer's money, worked out from the plan prices and how much of the current period
 * is left. It is an estimate shown BEFORE the customer agrees: Stripe computes the real figures (to the second) when the
 * change is made, and the invoice that results is the final word.
 *  - upgrade: the saved card is charged today for the new plan's remaining time, less the credit for the old plan's unused time;
 *  - downgrade: the unused part of the old plan, less the new plan's remaining time, becomes a credit on the next invoice.
 */
/**
 * What the customer really pays for the plan they are on: their own Stripe price. After an admin edits a plan's price, only
 * new subscribers pay the new amount, so the plan's price today can differ from what this customer was charged and will be
 * credited. Falls back to the plan's price when Stripe doesn't say.
 */
export function paidPlanFromStripe<P extends PlanLike>(stripeSub: { items?: { data?: { price?: { unit_amount?: number | null; recurring?: { interval?: string } | null } }[] } }, plan: P): P {
  const price = stripeSub.items?.data?.[0]?.price;
  if (typeof price?.unit_amount !== "number") return plan;
  const interval = price.recurring?.interval === "year" ? "YEARLY" : price.recurring?.interval === "month" ? "MONTHLY" : plan.billingInterval;
  return { ...plan, priceAmount: price.unit_amount, billingInterval: interval };
}

export async function estimatePlanChange(userId: string, planId: string, now = new Date()) {
  const sub = await subscriptionRepository.findByUserId(userId);
  if (!sub || !statusGrantsAccess(sub.status)) throw new ConflictError("You need an active subscription to change plans.");
  const toPlan = await resolveActivePlanOrThrow(planId);
  if (toPlan.id === sub.planId) throw new ConflictError("You are already on this plan.");
  const fromPlanRow = await planRepository.findById(sub.planId);
  if (!fromPlanRow) throw new NotFoundError("Current plan not found");
  const fromPlan = paidPlanFromStripe(await stripeService.retrieveSubscription(sub.stripeSubscriptionId).catch(() => ({})), fromPlanRow);

  const start = sub.currentPeriodStart?.getTime() ?? now.getTime();
  const end = sub.currentPeriodEnd?.getTime() ?? now.getTime();
  const total = Math.max(1, end - start);
  const left = Math.min(total, Math.max(0, end - now.getTime()));
  const fraction = left / total;
  const sameInterval = fromPlan.billingInterval === toPlan.billingInterval;

  const creditForUnused = Math.round(fromPlan.priceAmount * fraction);
  // switching between monthly and yearly starts a new billing period today, so the new plan is charged in full
  const newPlanForRest = sameInterval ? Math.round(toPlan.priceAmount * fraction) : toPlan.priceAmount;
  const net = newPlanForRest - creditForUnused;
  const direction = isUpgradeBetween(fromPlan, toPlan) ? ("upgrade" as const) : ("downgrade" as const);
  // Stripe uses a customer's credit up on their next invoice, and an upgrade's invoice is that invoice: so credit already on the
  // account pays for (part of) the upgrade before the card is charged.
  const accountCredit = (await getAccountCredit(userId).catch(() => ({ amount: 0 }))).amount;
  const owed = Math.max(0, net);
  const creditApplied = direction === "upgrade" ? Math.min(accountCredit, owed) : 0;
  const nextRenewal = sameInterval ? (sub.currentPeriodEnd ?? null) : new Date(now.getTime() + (toPlan.billingInterval === "YEARLY" ? 365 : 30) * 86_400_000);

  return {
    direction,
    estimate: true as const,
    currency: toPlan.currency,
    fromPlan: summary(fromPlan),
    toPlan: summary(toPlan),
    periodEnd: sub.currentPeriodEnd ?? null,
    daysLeft: Math.ceil(left / 86_400_000),
    creditForUnused,
    newPlanForRest,
    /** credit the customer already had, which an upgrade uses before the card is charged */
    accountCredit,
    creditApplied,
    /** charged to the saved card right now (upgrades only), after the credit */
    chargeToday: direction === "upgrade" ? owed - creditApplied : 0,
    /** added to the customer's credit, used up by the next invoice (downgrades only) */
    creditAdded: direction === "downgrade" ? Math.max(0, -net) : 0,
    nextRenewal: nextRenewal ? { date: nextRenewal, amount: toPlan.priceAmount } : null,
    paymentMethod: await getDefaultPaymentMethodSummary(userId),
  };
}

/**
 * The customer's credit: Stripe's customer balance plus anything still waiting on the next invoice (a downgrade's unused-time
 * credit, and the charges that go with quick back-and-forth plan changes), all netted together the way Stripe nets them on the
 * next invoice. Never negative.
 */
export async function getAccountCredit(userId: string) {
  const sub = await subscriptionRepository.findByUserId(userId);
  if (!sub) return { amount: 0, currency: "usd" };
  const customerId = await getOrCreateStripeCustomer(userId);
  const [customer, pendingItems] = await Promise.all([stripeService.retrieveCustomer(customerId), stripeService.listPendingInvoiceItems(customerId)]);
  // Stripe's balance is negative when the customer is owed money, and pending invoice items are negative when they are credits
  const balance = "balance" in customer && typeof customer.balance === "number" ? customer.balance : 0;
  const pending = pendingItems.reduce((sum, item) => sum + item.amount, 0);
  const net = Math.max(0, -(balance + pending));
  return { amount: net, currency: sub.plan?.currency ?? "usd" };
}
