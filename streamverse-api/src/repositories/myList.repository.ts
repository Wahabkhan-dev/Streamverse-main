import { prisma } from "../config/database";

const WITH_CONTENT = {
  content: { include: { genres: { include: { genre: true } }, tags: { include: { tag: true } }, languages: { include: { language: true } }, warnings: { include: { warningType: true } } } },
} as const;

export const add = (userId: string, contentId: string) => prisma.userSavedContent.upsert({ where: { userId_contentId: { userId, contentId } }, create: { userId, contentId }, update: {} });
export const remove = (userId: string, contentId: string) => prisma.userSavedContent.deleteMany({ where: { userId, contentId } });
export const list = (userId: string) => prisma.userSavedContent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, include: WITH_CONTENT });
