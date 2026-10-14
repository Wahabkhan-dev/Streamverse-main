import { prisma } from "../config/database";

export const create = (data: { name: string; slug: string; description?: string | undefined; contentType?: "MOVIE" | "EBOOK" | "AUDIOBOOK" | undefined }) => prisma.genre.create({ data });
export const update = (id: string, data: Partial<{ name: string; slug: string; description: string | null; contentType: "MOVIE" | "EBOOK" | "AUDIOBOOK" | null; active: boolean }>) =>
  prisma.genre.update({ where: { id }, data });
export const findById = (id: string) => prisma.genre.findUnique({ where: { id } });
export const findBySlug = (slug: string) => prisma.genre.findUnique({ where: { slug } });
export const slugExists = async (slug: string, excludeId?: string) => (await prisma.genre.count({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })) > 0;
export const list = () => prisma.genre.findMany({ orderBy: { name: "asc" } });
/** Section 19: the customer-facing list — active genres only, never the deactivated ones Admin hid. */
export const listActive = () => prisma.genre.findMany({ where: { active: true }, orderBy: { name: "asc" } });
/** Section 16: a genre in use cannot be renamed into oblivion — deletion is blocked while any title still uses it. */
export const usageCount = (id: string) => prisma.contentGenre.count({ where: { genreId: id } });
export const remove = (id: string) => prisma.genre.delete({ where: { id } });
