import { prisma } from "../config/database";

export const findBySlug = (slug: string) => prisma.tag.findUnique({ where: { slug } });
export const create = (data: { name: string; slug: string }) => prisma.tag.create({ data });
export const list = () => prisma.tag.findMany({ orderBy: { name: "asc" } });
