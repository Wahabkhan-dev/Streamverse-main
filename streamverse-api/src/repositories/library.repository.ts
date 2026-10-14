import { prisma } from "../config/database";

const WITH_CONTENT = {
  content: { include: { genres: { include: { genre: true } }, tags: { include: { tag: true } }, languages: { include: { language: true } }, warnings: { include: { warningType: true } } } },
} as const;

export const add = (userId: string, contentId: string, source?: string) =>
  prisma.libraryItem.upsert({ where: { userId_contentId: { userId, contentId } }, create: { userId, contentId, source }, update: {} });
export const remove = (userId: string, contentId: string) => prisma.libraryItem.deleteMany({ where: { userId, contentId } });
export const list = (userId: string) => prisma.libraryItem.findMany({ where: { userId }, orderBy: { addedAt: "desc" }, include: WITH_CONTENT });
