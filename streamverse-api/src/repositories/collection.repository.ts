import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export const create = (data: Prisma.CollectionUncheckedCreateInput) => prisma.collection.create({ data });
export const update = (id: string, data: Prisma.CollectionUncheckedUpdateInput) => prisma.collection.update({ where: { id }, data });
export const findById = (id: string) => prisma.collection.findUnique({ where: { id } });
export const slugExists = async (slug: string, excludeId?: string) => (await prisma.collection.count({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })) > 0;
/** Collections have no `deletedAt` — "removing" one is done through status (ARCHIVED), not a hard delete. */
export const archive = (id: string) => prisma.collection.update({ where: { id }, data: { status: "ARCHIVED" } });

export async function list(filters: { search?: string; status?: Prisma.CollectionWhereInput["status"] }, skip: number, take: number, orderBy: Prisma.CollectionOrderByWithRelationInput) {
  const where: Prisma.CollectionWhereInput = { ...(filters.status ? { status: filters.status } : {}), ...(filters.search ? { name: { contains: filters.search } } : {}) };
  const [rows, total] = await Promise.all([prisma.collection.findMany({ where, skip, take, orderBy }), prisma.collection.count({ where })]);
  return { rows, total };
}

export const addItem = (collectionId: string, contentId: string, displayOrder = 0) => prisma.collectionItem.create({ data: { collectionId, contentId, displayOrder } });
export const removeItem = (collectionId: string, contentId: string) => prisma.collectionItem.deleteMany({ where: { collectionId, contentId } });
export const itemExists = async (collectionId: string, contentId: string) => (await prisma.collectionItem.count({ where: { collectionId, contentId } })) > 0;
export const itemsFor = (collectionId: string) => prisma.collectionItem.findMany({ where: { collectionId }, include: { content: true }, orderBy: { displayOrder: "asc" } });

/* ---------------------------------------------------------------- customer reads (Section 17/18) */

export const findPublishedBySlug = (slug: string) => prisma.collection.findFirst({ where: { slug, status: "PUBLISHED" } });

export async function listPublished(skip: number, take: number) {
  const where: Prisma.CollectionWhereInput = { status: "PUBLISHED" };
  const [rows, total] = await Promise.all([prisma.collection.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }), prisma.collection.count({ where })]);
  return { rows, total };
}

/** Items with their Content row and its shared relations, for filtering to customer-visible ones. */
export const itemsWithContent = (collectionId: string) =>
  prisma.collectionItem.findMany({
    where: { collectionId },
    orderBy: { displayOrder: "asc" },
    include: { content: { include: { genres: { include: { genre: true } }, tags: { include: { tag: true } }, languages: { include: { language: true } }, warnings: { include: { warningType: true } } } } },
  });
/** Section 30: reorder identifies items by `contentId` (not the item row's own id). */
export const reorderItems = (collectionId: string, items: { contentId: string; displayOrder: number }[]) =>
  Promise.all(items.map((i) => prisma.collectionItem.updateMany({ where: { collectionId, contentId: i.contentId }, data: { displayOrder: i.displayOrder } })));
