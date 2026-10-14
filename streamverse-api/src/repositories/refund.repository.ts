import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export const create = (data: Prisma.RefundUncheckedCreateInput) => prisma.refund.create({ data });
export const update = (id: string, data: Prisma.RefundUncheckedUpdateInput) => prisma.refund.update({ where: { id }, data });
export const findById = (id: string) => prisma.refund.findUnique({ where: { id } });
export const findByStripeRefundId = (stripeRefundId: string) => prisma.refund.findUnique({ where: { stripeRefundId } });
export const listForPayment = (paymentId: string) => prisma.refund.findMany({ where: { paymentId }, orderBy: { createdAt: "desc" } });

/** Section 55/106: how much of a payment is already refunded/pending — the over-refund guard reads this. */
export async function totalRefundedOrPending(paymentId: string): Promise<number> {
  const rows = await prisma.refund.findMany({ where: { paymentId, status: { in: ["SUCCEEDED", "PENDING"] } } });
  return rows.reduce((sum, r) => sum + r.amount, 0);
}
