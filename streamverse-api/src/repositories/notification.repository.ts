import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export function list(userId: string, filters: { unreadOnly?: boolean }, skip: number, take: number) {
  const where: Prisma.NotificationWhereInput = { userId, ...(filters.unreadOnly ? { readAt: null } : {}) };
  return Promise.all([prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }), prisma.notification.count({ where }), prisma.notification.count({ where: { userId, readAt: null } })]);
}

export const findById = (id: string) => prisma.notification.findUnique({ where: { id } });
export const create = (data: Prisma.NotificationUncheckedCreateInput) => prisma.notification.create({ data });
export const markRead = (id: string) => prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
export const markAllRead = (userId: string) => prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
export const remove = (id: string) => prisma.notification.delete({ where: { id } });
