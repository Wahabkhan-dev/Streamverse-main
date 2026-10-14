import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export const findById = (id: string) => prisma.plan.findUnique({ where: { id } });
export const findBySlug = (slug: string) => prisma.plan.findUnique({ where: { slug } });
export const findActiveById = (id: string) => prisma.plan.findFirst({ where: { id, active: true } });

export const create = (data: Prisma.PlanUncheckedCreateInput) => prisma.plan.create({ data });
export const update = (id: string, data: Prisma.PlanUncheckedUpdateInput) => prisma.plan.update({ where: { id }, data });

export const listAll = () => prisma.plan.findMany({ orderBy: { displayOrder: "asc" } });
export const listActive = () => prisma.plan.findMany({ where: { active: true }, orderBy: { displayOrder: "asc" } });

export const slugExists = async (slug: string, excludeId?: string) => (await prisma.plan.count({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })) > 0;
export const stripePriceIdExists = async (stripePriceId: string, excludeId?: string) => (await prisma.plan.count({ where: { stripePriceId, ...(excludeId ? { id: { not: excludeId } } : {}) } })) > 0;

/** Section 10/114: never hard-deleted while referenced — true when any Subscription points at this plan. */
export const isReferencedBySubscription = async (id: string) => (await prisma.subscription.count({ where: { planId: id } })) > 0;
