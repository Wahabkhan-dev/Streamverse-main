import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export const findById = (id: string) => prisma.payment.findUnique({ where: { id }, include: { refunds: true, subscription: { include: { plan: true } }, user: { select: { id: true, email: true, fullName: true } } } });
export const findByStripeInvoiceId = (stripeInvoiceId: string) => prisma.payment.findUnique({ where: { stripeInvoiceId } });
export const findByStripePaymentIntentId = (stripePaymentIntentId: string) => prisma.payment.findUnique({ where: { stripePaymentIntentId } });
export const findByStripeChargeId = (stripeChargeId: string) => prisma.payment.findFirst({ where: { stripeChargeId } });

export const create = (data: Prisma.PaymentUncheckedCreateInput) => prisma.payment.create({ data });
export const update = (id: string, data: Prisma.PaymentUncheckedUpdateInput) => prisma.payment.update({ where: { id }, data });

export async function listForUser(userId: string, skip: number, take: number) {
  const where: Prisma.PaymentWhereInput = { userId };
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: { subscription: { include: { plan: true } }, refunds: true } }),
    prisma.payment.count({ where }),
  ]);
  return { rows, total };
}

export interface AdminPaymentFilters {
  status?: Prisma.PaymentWhereInput["status"];
  currency?: string;
  userId?: string;
  from?: Date;
  to?: Date;
}

export function adminListWhere(filters: AdminPaymentFilters): Prisma.PaymentWhereInput {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.currency ? { currency: filters.currency } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.from || filters.to ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}),
  };
}

export async function adminList(where: Prisma.PaymentWhereInput, skip: number, take: number) {
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, email: true, fullName: true } }, subscription: { include: { plan: true } } } }),
    prisma.payment.count({ where }),
  ]);
  return { rows, total };
}

/** Section 53: the admin summary cards are derived from these, never hardcoded. */
export async function summaryCounts(where: Prisma.PaymentWhereInput = {}) {
  const [total, succeeded, pending, failed, refunded, partiallyRefunded, revenue] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.count({ where: { ...where, status: "SUCCEEDED" } }),
    prisma.payment.count({ where: { ...where, status: "PENDING" } }),
    prisma.payment.count({ where: { ...where, status: "FAILED" } }),
    prisma.payment.count({ where: { ...where, status: "REFUNDED" } }),
    prisma.payment.count({ where: { ...where, status: "PARTIALLY_REFUNDED" } }),
    prisma.payment.aggregate({ where: { ...where, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } }, _sum: { amount: true } }),
  ]);
  return { total, succeeded, pending, failed, refunded, partiallyRefunded, revenueMinor: revenue._sum.amount ?? 0 };
}
