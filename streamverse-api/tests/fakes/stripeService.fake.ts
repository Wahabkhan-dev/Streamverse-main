import { randomUUID } from "node:crypto";

/**
 * Stands in for `src/services/stripe/stripe.service.ts` — the one seam tests `vi.mock` instead of ever
 * calling the real Stripe network (the same substitution pattern as `tests/fakePrisma.ts` for Postgres
 * and `tests/fakes/mediaProcessor.fake.ts` for ffmpeg). Exposes every function the real module exports,
 * plus test-only helpers (`__reset`, `__setSubscriptionStatus`, `__buildEvent`) to drive scenarios.
 */

interface FakeCustomer {
  id: string;
  email: string;
  metadata: Record<string, string>;
  defaultPaymentMethodId: string | null;
}
interface FakePaymentMethod {
  id: string;
  customer: string;
  card: { brand: string; last4: string; exp_month: number; exp_year: number };
}
interface FakeSubscriptionItem {
  id: string;
  price: { id: string };
  current_period_start: number;
  current_period_end: number;
}
interface FakeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  trial_end: number | null;
  metadata: Record<string, string>;
  items: { data: FakeSubscriptionItem[] };
}
interface FakeRefund {
  id: string;
  payment_intent: string;
  amount: number;
  status: string;
  reason?: string;
}

let customers = new Map<string, FakeCustomer>();
let paymentMethods = new Map<string, FakePaymentMethod>();
let subscriptions = new Map<string, FakeSubscription>();
let refunds = new Map<string, FakeRefund>();
let nextSessionUrl = "https://checkout.stripe.test/session";

export function __reset() {
  customers = new Map();
  paymentMethods = new Map();
  subscriptions = new Map();
  refunds = new Map();
}

export async function createCustomer(email: string, userId: string) {
  const customer: FakeCustomer = { id: `cus_${randomUUID()}`, email, metadata: { streamVerseUserId: userId }, defaultPaymentMethodId: null };
  customers.set(customer.id, customer);
  return customer;
}

export async function deleteCustomer(stripeCustomerId: string): Promise<void> {
  customers.delete(stripeCustomerId);
}

export async function retrieveCustomer(stripeCustomerId: string) {
  const c = customers.get(stripeCustomerId);
  if (!c) throw new Error("No such customer");
  return { id: c.id, email: c.email, deleted: false, invoice_settings: { default_payment_method: c.defaultPaymentMethodId } };
}

export async function updateCustomerDefaultPaymentMethod(stripeCustomerId: string, paymentMethodId: string) {
  const c = customers.get(stripeCustomerId);
  if (!c) throw new Error("No such customer");
  c.defaultPaymentMethodId = paymentMethodId;
  return { id: c.id };
}

export async function createSetupIntent(stripeCustomerId: string) {
  return { id: `seti_${randomUUID()}`, client_secret: `seti_${randomUUID()}_secret_test`, customer: stripeCustomerId };
}

export async function listPaymentMethods(stripeCustomerId: string) {
  return [...paymentMethods.values()].filter((pm) => pm.customer === stripeCustomerId);
}

export async function retrievePaymentMethod(paymentMethodId: string) {
  const pm = paymentMethods.get(paymentMethodId);
  if (!pm) throw new Error("No such payment method");
  return pm;
}

export async function detachPaymentMethod(paymentMethodId: string) {
  const pm = paymentMethods.get(paymentMethodId);
  paymentMethods.delete(paymentMethodId);
  return pm;
}

export async function createCheckoutSession(params: { stripeCustomerId: string; priceId: string; userId: string; planId: string }) {
  return { id: `cs_${randomUUID()}`, url: `${nextSessionUrl}/${randomUUID()}`, customer: params.stripeCustomerId };
}

export async function createBillingPortalSession(stripeCustomerId: string) {
  return { id: `bps_${randomUUID()}`, url: `https://billing.stripe.test/portal/${stripeCustomerId}` };
}

export async function retrieveSubscription(stripeSubscriptionId: string) {
  const sub = subscriptions.get(stripeSubscriptionId);
  if (!sub) throw new Error("No such subscription");
  return sub;
}

export async function setSubscriptionCancelAtPeriodEnd(stripeSubscriptionId: string, cancelAtPeriodEnd: boolean) {
  const sub = subscriptions.get(stripeSubscriptionId);
  if (!sub) throw new Error("No such subscription");
  sub.cancel_at_period_end = cancelAtPeriodEnd;
  return sub;
}

export async function changeSubscriptionPrice(stripeSubscriptionId: string, subscriptionItemId: string, newPriceId: string) {
  const sub = subscriptions.get(stripeSubscriptionId);
  if (!sub) throw new Error("No such subscription");
  const item = sub.items.data.find((i) => i.id === subscriptionItemId);
  if (item) item.price = { id: newPriceId };
  return sub;
}

export async function retrievePaymentIntent(paymentIntentId: string) {
  return { id: paymentIntentId, status: "succeeded" };
}

export async function createRefund(params: { paymentIntentId: string; amount?: number; reason?: string }) {
  const refund: FakeRefund = { id: `re_${randomUUID()}`, payment_intent: params.paymentIntentId, amount: params.amount ?? 0, status: "succeeded", reason: params.reason };
  refunds.set(refund.id, refund);
  return refund;
}

export function constructWebhookEvent(rawBody: Buffer, signature: string) {
  if (signature !== "valid-test-signature") throw new Error("Invalid signature");
  return JSON.parse(rawBody.toString("utf8"));
}

/* ---------------------------------------------------------------- test-only helpers */

export function __createFakeCustomer(email: string, userId: string) {
  const customer: FakeCustomer = { id: `cus_${randomUUID()}`, email, metadata: { streamVerseUserId: userId }, defaultPaymentMethodId: null };
  customers.set(customer.id, customer);
  return customer;
}

export function __attachPaymentMethod(customerId: string, card: Partial<FakePaymentMethod["card"]> = {}) {
  const pm: FakePaymentMethod = { id: `pm_${randomUUID()}`, customer: customerId, card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030, ...card } };
  paymentMethods.set(pm.id, pm);
  return pm;
}

export function __createFakeSubscription(params: { customerId: string; priceId: string; userId: string; planId: string; status?: string; periodStart?: Date; periodEnd?: Date }) {
  const sub: FakeSubscription = {
    id: `sub_${randomUUID()}`,
    customer: params.customerId,
    status: params.status ?? "active",
    cancel_at_period_end: false,
    canceled_at: null,
    trial_end: null,
    metadata: { streamVerseUserId: params.userId, streamVersePlanId: params.planId },
    items: {
      data: [
        {
          id: `si_${randomUUID()}`,
          price: { id: params.priceId },
          current_period_start: Math.floor((params.periodStart ?? new Date()).getTime() / 1000),
          current_period_end: Math.floor((params.periodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).getTime() / 1000),
        },
      ],
    },
  };
  subscriptions.set(sub.id, sub);
  return sub;
}

export function __setSubscriptionStatus(stripeSubscriptionId: string, status: string) {
  const sub = subscriptions.get(stripeSubscriptionId);
  if (sub) sub.status = status;
  return sub;
}

export function __getRefund(id: string) {
  return refunds.get(id);
}

let eventCounter = 0;
/** Builds a minimal Stripe Event envelope, raw-serialized the same way the real webhook body arrives. */
export function __buildEventBody(type: string, object: unknown): Buffer {
  eventCounter++;
  return Buffer.from(JSON.stringify({ id: `evt_test_${eventCounter}`, type, data: { object } } ));
}
