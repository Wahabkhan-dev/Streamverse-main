import type Stripe from "stripe";
import * as paymentRepository from "../../repositories/payment.repository";
import * as refundRepository from "../../repositories/refund.repository";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors";
import type { AuditContext } from "../auditLog.service";
import { recordAudit } from "../auditLog.service";
import { createNotification } from "../notification.service";
import * as stripeService from "../stripe/stripe.service";

/**
 * Section 54/55/56: admin-only. Validates existence, prior success, and the REMAINING refundable amount
 * (never trusts a frontend-supplied amount blindly) before ever calling Stripe. The local Refund row is
 * created PENDING and only promoted to SUCCEEDED once Stripe's own response (or the later `charge.refunded`
 * webhook — Section 68) confirms it; Payment.status is derived from the total refunded amount afterward.
 */
export async function refundPayment(paymentId: string, input: { amount?: number; reason?: string }, adminUserId: string, ctx: AuditContext) {
  const payment = await paymentRepository.findById(paymentId);
  if (!payment) throw new NotFoundError("Payment not found");
  if (payment.status !== "SUCCEEDED" && payment.status !== "PARTIALLY_REFUNDED") {
    throw new ConflictError(`Cannot refund a payment with status ${payment.status} — it was never successfully charged.`);
  }
  if (!payment.stripePaymentIntentId) throw new ValidationError([{ path: "paymentId", message: "This payment has no associated Stripe PaymentIntent to refund." }]);

  const alreadyRefunded = await refundRepository.totalRefundedOrPending(paymentId);
  const remaining = payment.amount - alreadyRefunded;
  if (remaining <= 0) throw new ConflictError("This payment has already been fully refunded.");

  const amount = input.amount ?? remaining;
  if (amount <= 0) throw new ValidationError([{ path: "amount", message: "Refund amount must be greater than zero." }]);
  if (amount > remaining) throw new ValidationError([{ path: "amount", message: `Refund amount exceeds the remaining refundable amount (${remaining} ${payment.currency}).` }]);

  const refund = await refundRepository.create({ paymentId, amount, currency: payment.currency, reason: input.reason, status: "PENDING", createdByAdminId: adminUserId });

  let stripeRefund: Stripe.Refund;
  try {
    stripeRefund = await stripeService.createRefund({ paymentIntentId: payment.stripePaymentIntentId, amount, reason: input.reason, idempotencyKey: `refund-${refund.id}`});
  } catch (err) {
    await refundRepository.update(refund.id, { status: "FAILED" });
    throw err;
  }

  const succeeded = stripeRefund.status === "succeeded";
  await refundRepository.update(refund.id, { stripeRefundId: stripeRefund.id, status: succeeded ? "SUCCEEDED" : stripeRefund.status === "failed" ? "FAILED" : "PENDING" });
  if (succeeded) await syncPaymentRefundStatus(paymentId);

  await createNotification(payment.userId, "SUBSCRIPTION", "Refund processed", "A refund has been issued to your original payment method.");
  await recordAudit(ctx, { action: "payment.refund_initiated", entityType: "PAYMENT", entityId: paymentId, metadata: { amount, refundId: refund.id } });

  return refundRepository.findById(refund.id);
}

/** Section 68: re-derives Payment.status from the sum of SUCCEEDED refunds — full vs partial, never guessed. */
export async function syncPaymentRefundStatus(paymentId: string): Promise<void> {
  const payment = await paymentRepository.findById(paymentId);
  if (!payment) return;
  const refunds = await refundRepository.listForPayment(paymentId);
  const totalSucceeded = refunds.filter((r) => r.status === "SUCCEEDED").reduce((sum, r) => sum + r.amount, 0);
  if (totalSucceeded <= 0) return;
  const status = totalSucceeded >= payment.amount ? "REFUNDED" : "PARTIALLY_REFUNDED";
  if (payment.status !== status) await paymentRepository.update(paymentId, { status });
}

/** Section 68: applies a `charge.refunded` (or refund-object) webhook — idempotent re-application is harmless. */
export async function applyStripeRefundEvent(stripeRefund: Stripe.Refund): Promise<void> {
  const existing = await refundRepository.findByStripeRefundId(stripeRefund.id);
  if (!existing) return; // a refund StreamVerse didn't initiate — nothing local to reconcile
  const status = stripeRefund.status === "succeeded" ? "SUCCEEDED" : stripeRefund.status === "failed" ? "FAILED" : stripeRefund.status === "canceled" ? "CANCELED" : "PENDING";
  if (existing.status !== status) await refundRepository.update(existing.id, { status });
  await syncPaymentRefundStatus(existing.paymentId);
}
