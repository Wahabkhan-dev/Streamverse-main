import { prisma } from "../config/database";

export const create = (userId: string, ebookId: string, data: { location: string; page?: number; label?: string }) => prisma.ebookBookmark.create({ data: { userId, ebookId, ...data } });
export const findById = (id: string) => prisma.ebookBookmark.findUnique({ where: { id } });
export const remove = (id: string) => prisma.ebookBookmark.delete({ where: { id } });
export const list = (userId: string, ebookId: string) => prisma.ebookBookmark.findMany({ where: { userId, ebookId }, orderBy: { createdAt: "desc" } });
