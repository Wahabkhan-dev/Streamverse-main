import type Stripe from "stripe";
import * as paymentRepository from "../../repositories/payment.repository";
import * as subscriptionRepository from "../../repositories/subscription.repository";
import * as userRepository from "../../repositories/user.repository";
import { NotFoundError } from "../../utils/errors";
import { buildPagination, toSkipTake } from "../../utils/pagination";
import { createNotification } from "../notification.service";

/** Section 24/25/65: Payment rows are created ONLY from verified Stripe webhook data — never a frontend "it worked" claim. */
export async function recordPaymentFromInvoice(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  const user = await userRepository.findByStripeCustomerId(customerId);
  if (!user) return; // nothing local to reconcile yet — reconciliation job can backfill if this ever happens

  const subscriptionId = invoiceSubscriptionId(invoice);
  const local = subscriptionId ? await subscriptionRepository.findByStripeSubscriptionId(subscriptionId) : null;

  const existing = await paymentRepository.findByStripeInvoiceId(invoice.id!);
  const paymentIntentId = invoicePaymentIntentId(invoice);
  const data = {
    userId: user.id,
    subscriptionId: local?.id,
    stripeInvoiceId: invoice.id!,
    stripePaymentIntentId: paymentIntentId,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    status: "SUCCEEDED" as const,
    description: invoice.description ?? undefined,
    paidAt: (invoice as any).status_transitions?.paid_at
      ? new Date((invoice as any).status_transitions.paid_at * 1000)
      : new Date(),
  };

  if (existing) {
    // Never overwrite a settled state — a late invoice.paid must not undo a REFUNDED row
    if (existing.status === "SUCCEEDED" || existing.status === "REFUNDED" || existing.status === "PARTIALLY_REFUNDED") return;
    await paymentRepository.update(existing.id, data);
  } else {
    await paymentRepository.create(data);
  }
  await createNotification(user.id, "SUBSCRIPTION", "Payment succeeded", "Thanks! Your payment was processed successfully.");
}

/** Section 66: records the failure; does not touch the subscription row — Stripe's own subscription-status webhook drives that. */
export async function recordPaymentFailureFromInvoice(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  const user = await userRepository.findByStripeCustomerId(customerId);
  if (!user) return;

  const subscriptionId = invoiceSubscriptionId(invoice);
  const local = subscriptionId ? await subscriptionRepository.findByStripeSubscriptionId(subscriptionId) : null;
  const existing = await paymentRepository.findByStripeInvoiceId(invoice.id!);
  const data = {
    userId: user.id,
    subscriptionId: local?.id,
    stripeInvoiceId: invoice.id!,
    stripePaymentIntentId: invoicePaymentIntentId(invoice),
    amount: invoice.amount_due,
    currency: invoice.currency,
    status: "FAILED" as const,
    description: invoice.description ?? undefined,
  };

  if (existing) {
    // Never overwrite a settled/succeeded state — a late invoice.payment_failed must not undo SUCCEEDED or REFUNDED
    if (existing.status === "SUCCEEDED" || existing.status === "REFUNDED" || existing.status === "PARTIALLY_REFUNDED" || existing.status === "FAILED") return;
    await paymentRepository.update(existing.id, data);
  } else {
    await paymentRepository.create(data);
  }
  await createNotification(user.id, "SUBSCRIPTION", "Payment failed", "We couldn't process your latest payment. Please check your payment method.");
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  // API 2026-09-30.endive: subscription is at parent.subscription_details.subscription
  const sub = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null }).parent?.subscription_details?.subscription;
  if (sub) return typeof sub === "string" ? sub : sub.id;
  // Fallback for older API versions / test fixtures
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  return typeof legacy === "string" ? legacy : legacy?.id;
}
function invoicePaymentIntentId(invoice: Stripe.Invoice): string | undefined {
  // API 2026-09-30.endive: payment_intent is in invoice.payments[0].payment.payment_intent
  const payments = (invoice as unknown as { payments?: { data?: Array<{ payment?: { payment_intent?: string | { id: string } | null } }> } | null }).payments;
  const piFromPayments = payments?.data?.[0]?.payment?.payment_intent;
  if (piFromPayments) return typeof piFromPayments === "string" ? piFromPayments : piFromPayments.id;
  // Fallback for older API versions / test fixtures
  const pi = (invoice as unknown as { payment_intent?: string | { id: string } | null }).payment_intent;
  return typeof pi === "string" ? pi : pi?.id;
}

/** Section 26/27: the customer's own billing history — paginated, receipt URL only if Stripe gave us one to pass through. */
export async function listMyPayments(userId: string, page: number, limit: number) {
  const { skip, take } = toSkipTake(page, limit);
  const { rows, total } = await paymentRepository.listForUser(userId, skip, take);
  return {
    rows: rows.map((p) => ({
      id: p.id,
      date: p.paidAt ?? p.createdAt,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      plan: p.subscription?.plan ? { id: p.subscription.plan.id, name: p.subscription.plan.name } : null,
      invoiceReference: p.stripeInvoiceId,
      refunded: p.refunds.length > 0,
    })),
    pagination: buildPagination(total, page, limit),
  };
}

/* ---------------------------------------------------------------- admin (Section 51-53) */

export interface AdminPaymentFilters {
  page: number;
  limit: number;
  status?: string | undefined;
  currency?: string | undefined;
  userId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

export async function adminListPayments(filters: AdminPaymentFilters) {
  const where = paymentRepository.adminListWhere(filters as never);
  const { skip, take } = toSkipTake(filters.page, filters.limit);
  const { rows, total } = await paymentRepository.adminList(where, skip, take);
  return { rows, pagination: buildPagination(total, filters.page, filters.limit) };
}

export async function adminGetPayment(id: string) {
  const payment = await paymentRepository.findById(id);
  if (!payment) throw new NotFoundError("Payment not found");
  return payment;
}

/** Section 53/107: every number here is a live aggregate over the Payment table — never a hardcoded card. */
export async function adminPaymentSummary(filters: Omit<AdminPaymentFilters, "page" | "limit"> = {}) {
  const where = paymentRepository.adminListWhere(filters as never);
  const counts = await paymentRepository.summaryCounts(where);
  return {
    totalPayments: counts.total,
    succeeded: counts.succeeded,
    pending: counts.pending,
    failed: counts.failed,
    refunded: counts.refunded,
    partiallyRefunded: counts.partiallyRefunded,
    revenueMinor: counts.revenueMinor,
  };
}
