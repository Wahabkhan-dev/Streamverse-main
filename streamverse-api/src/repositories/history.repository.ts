import type { HistoryActivityType, Prisma } from "@prisma/client";
import { prisma } from "../config/database";

/** One row per (user, content) — touches `lastAccessedAt`/`removedAt` in place, never inserts a new row per tick. */
export const touch = (userId: string, contentId: string, activityType: HistoryActivityType) =>
  prisma.userHistory.upsert({
    where: { userId_contentId: { userId, contentId } },
    create: { userId, contentId, activityType },
    update: { activityType, lastAccessedAt: new Date(), removedAt: null }, // re-accessing un-removes it
  });

export const remove = (userId: string, contentId: string) => prisma.userHistory.updateMany({ where: { userId, contentId }, data: { removedAt: new Date() } });

const WITH_CONTENT = {
  content: { include: { genres: { include: { genre: true } }, tags: { include: { tag: true } }, languages: { include: { language: true } }, warnings: { include: { warningType: true } } } },
} as const;

export function list(userId: string, filters: { activityType?: HistoryActivityType }, skip: number, take: number) {
  const where: Prisma.UserHistoryWhereInput = { userId, removedAt: null, ...(filters.activityType ? { activityType: filters.activityType } : {}) };
  return Promise.all([
    prisma.userHistory.findMany({ where, skip, take, orderBy: { lastAccessedAt: "desc" }, include: WITH_CONTENT }),
    prisma.userHistory.count({ where }),
  ]);
}
