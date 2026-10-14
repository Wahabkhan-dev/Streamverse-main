import { prisma } from "../config/database";

export const findByCode = (code: string) => prisma.language.findUnique({ where: { code } });
export const findById = (id: string) => prisma.language.findUnique({ where: { id } });
export const create = (data: { code: string; name: string }) => prisma.language.create({ data });
export const list = (activeOnly = true) => prisma.language.findMany({ where: activeOnly ? { active: true } : undefined, orderBy: { name: "asc" } });
