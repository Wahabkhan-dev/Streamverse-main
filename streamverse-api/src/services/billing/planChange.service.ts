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
export async function estimatePlanChange(userId: string, planId: string, now = new Date()) {
  const sub = await subscriptionRepository.findByUserId(userId);
  if (!sub || !statusGrantsAccess(sub.status)) throw new ConflictError("You need an active subscription to change plans.");
  const toPlan = await resolveActivePlanOrThrow(planId);
  if (toPlan.id === sub.planId) throw new ConflictError("You are already on this plan.");
  const fromPlan = await planRepository.findById(sub.planId);
  if (!fromPlan) throw new NotFoundError("Current plan not found");

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
 * The customer's credit: Stripe's customer balance (what a past credit note or adjustment left) plus any credit still waiting on
 * the next invoice (a downgrade's unused-time credit). Both reduce what they pay next. Never negative.
 */
export async function getAccountCredit(userId: string) {
  const sub = await subscriptionRepository.findByUserId(userId);
  if (!sub) return { amount: 0, currency: "usd" };
  const customerId = await getOrCreateStripeCustomer(userId);
  const [customer, pending] = await Promise.all([stripeService.retrieveCustomer(customerId), stripeService.listPendingInvoiceItems(customerId)]);
  const balance = "balance" in customer && typeof customer.balance === "number" ? Math.max(0, -customer.balance) : 0;
  const pendingCredit = pending.reduce((sum, item) => sum + (item.amount < 0 ? -item.amount : 0), 0);
  return { amount: balance + pendingCredit, currency: sub.plan?.currency ?? "usd" };
}
