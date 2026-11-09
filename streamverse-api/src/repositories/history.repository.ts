import type { HistoryActivityType, Prisma } from "@prisma/client";
import { prisma } from "../config/database";

const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === "P2002";

/**
 * One row per (user, content) — touches `lastAccessedAt`/`removedAt` in place, never inserts a new row per tick.
 * Runs on every progress save, so it is ONE UPDATE in the usual case (Prisma's upsert on MySQL is a transaction of
 * begin + select + update + select + commit). Only the first time is it an INSERT; if two first saves race, the loser updates instead.
 */
export async function touch(userId: string, contentId: string, activityType: HistoryActivityType): Promise<void> {
  // one parameterised statement (Prisma's updateMany adds BEGIN/COMMIT round trips); re-accessing un-removes it
  const update = () =>
    prisma.$executeRaw`UPDATE \`UserHistory\` SET \`activityType\` = ${activityType}, \`lastAccessedAt\` = ${new Date()}, \`removedAt\` = NULL WHERE \`userId\` = ${userId} AND \`contentId\` = ${contentId}`;
  if ((await update()) > 0) return;
  try {
    await prisma.userHistory.create({ data: { userId, contentId, activityType } });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    await update();
  }
}

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
