import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

const WITH_PLAN = { plan: true } as const;

export const findByUserId = (userId: string) => prisma.subscription.findUnique({ where: { userId }, include: WITH_PLAN });
export const findByStripeSubscriptionId = (stripeSubscriptionId: string) => prisma.subscription.findUnique({ where: { stripeSubscriptionId }, include: WITH_PLAN });
export const findById = (id: string) => prisma.subscription.findUnique({ where: { id }, include: { plan: true, user: true } });

export const upsertByUserId = (userId: string, create: Prisma.SubscriptionUncheckedCreateInput, update: Prisma.SubscriptionUncheckedUpdateInput) =>
  prisma.subscription.upsert({ where: { userId }, create, update, include: WITH_PLAN });

export const upsertByStripeSubscriptionId = (stripeSubscriptionId: string, create: Prisma.SubscriptionUncheckedCreateInput, update: Prisma.SubscriptionUncheckedUpdateInput) =>
  prisma.subscription.upsert({ where: { stripeSubscriptionId }, create, update, include: WITH_PLAN });

export const update = (id: string, data: Prisma.SubscriptionUncheckedUpdateInput) => prisma.subscription.update({ where: { id }, data });
export const updateByStripeSubscriptionId = (stripeSubscriptionId: string, data: Prisma.SubscriptionUncheckedUpdateInput) =>
  prisma.subscription.update({ where: { stripeSubscriptionId }, data });

export interface AdminSubscriptionFilters {
  status?: Prisma.SubscriptionWhereInput["status"];
  planId?: string;
  search?: string;
}

export function adminListWhere(filters: AdminSubscriptionFilters): Prisma.SubscriptionWhereInput {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.planId ? { planId: filters.planId } : {}),
    ...(filters.search ? { user: { OR: [{ email: { contains: filters.search } }, { fullName: { contains: filters.search } }] } } : {}),
  };
}

export async function adminList(where: Prisma.SubscriptionWhereInput, skip: number, take: number) {
  const [rows, total] = await Promise.all([
    prisma.subscription.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: { plan: true, user: { select: { id: true, email: true, fullName: true } } } }),
    prisma.subscription.count({ where }),
  ]);
  return { rows, total };
}
