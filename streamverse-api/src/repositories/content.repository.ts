import type { Content, Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export type { Content };

export const slugExists = async (slug: string, excludeId?: string, client: Prisma.TransactionClient | typeof prisma = prisma): Promise<boolean> =>
  (await client.content.count({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })) > 0;

export const findById = (id: string) => prisma.content.findUnique({ where: { id } });
export const findBySlug = (slug: string) => prisma.content.findUnique({ where: { slug } });
export const findByContentCode = (contentCode: string) => prisma.content.findUnique({ where: { contentCode } });

export const create = (data: Prisma.ContentUncheckedCreateInput, client: Prisma.TransactionClient | typeof prisma = prisma) => client.content.create({ data });

/**
 * `data` is whatever the caller passes — callers are the content/movie/ebook/audiobook services, which
 * only ever pass the whitelisted, Zod-validated fields from updateXSchema. `id`, `contentCode`,
 * `createdById`, `createdAt`, `deletedAt` are never in those schemas, so there is no code path that can
 * reach this function with them (Section 64–66).
 */
export const update = (id: string, data: Prisma.ContentUncheckedUpdateInput, client: Prisma.TransactionClient | typeof prisma = prisma) => client.content.update({ where: { id }, data });

/** Soft delete only (Section 45/75): the row, its contentCode and its slug are kept, never freed for reuse. */
export const softDelete = (id: string) => prisma.content.update({ where: { id }, data: { deletedAt: new Date() } });

export const findActiveById = (id: string) => prisma.content.findFirst({ where: { id, deletedAt: null } });

export const runInTransaction = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn);

/* -------------------------------------------------------------- shared relation attachers
 * Used by movie/ebook/audiobook services right after creating the Content row — one createMany per
 * relation kind, inside the same transaction, so a title and its genres/tags/warnings/languages either
 * all land or none do.
 */
export const addGenres = (client: Prisma.TransactionClient | typeof prisma, contentId: string, genreIds: string[]) =>
  genreIds.length ? client.contentGenre.createMany({ data: genreIds.map((genreId) => ({ contentId, genreId })) }) : Promise.resolve({ count: 0 });

export const addTags = (client: Prisma.TransactionClient | typeof prisma, contentId: string, tagIds: string[]) =>
  tagIds.length ? client.contentTag.createMany({ data: tagIds.map((tagId) => ({ contentId, tagId })) }) : Promise.resolve({ count: 0 });

export const addWarnings = (client: Prisma.TransactionClient | typeof prisma, contentId: string, warningTypeIds: string[]) =>
  warningTypeIds.length ? client.contentWarning.createMany({ data: warningTypeIds.map((warningTypeId) => ({ contentId, warningTypeId })) }) : Promise.resolve({ count: 0 });

export const addLanguages = (client: Prisma.TransactionClient | typeof prisma, contentId: string, rows: { languageId: string; role: Prisma.ContentLanguageCreateInput["role"] }[]) =>
  rows.length ? client.contentLanguage.createMany({ data: rows.map((r) => ({ contentId, languageId: r.languageId, role: r.role })) }) : Promise.resolve({ count: 0 });

export const addTerritories = (client: Prisma.TransactionClient | typeof prisma, contentId: string, countryCodes: string[]) =>
  countryCodes.length ? client.contentTerritory.createMany({ data: countryCodes.map((countryCode) => ({ contentId, countryCode })) }) : Promise.resolve({ count: 0 });

/**
 * Section 48: `genreIds`/`tagIds`/etc on an update REPLACE the current selection — never append. Each
 * helper deletes the content's existing rows for that relation, then inserts the new set, so an autosave
 * loop can resend the same ids every time without piling up duplicates.
 */
export async function replaceGenres(tx: Prisma.TransactionClient, contentId: string, genreIds: string[]) {
  await tx.contentGenre.deleteMany({ where: { contentId } });
  await addGenres(tx, contentId, genreIds);
}
export async function replaceTags(tx: Prisma.TransactionClient, contentId: string, tagIds: string[]) {
  await tx.contentTag.deleteMany({ where: { contentId } });
  await addTags(tx, contentId, tagIds);
}
export async function replaceWarnings(tx: Prisma.TransactionClient, contentId: string, warningTypeIds: string[]) {
  await tx.contentWarning.deleteMany({ where: { contentId } });
  await addWarnings(tx, contentId, warningTypeIds);
}
export async function replaceLanguages(tx: Prisma.TransactionClient, contentId: string, rows: { languageId: string; role: Prisma.ContentLanguageCreateInput["role"] }[]) {
  await tx.contentLanguage.deleteMany({ where: { contentId } });
  await addLanguages(tx, contentId, rows);
}
export async function replaceTerritories(tx: Prisma.TransactionClient, contentId: string, countryCodes: string[]) {
  await tx.contentTerritory.deleteMany({ where: { contentId } });
  await addTerritories(tx, contentId, countryCodes);
}

const WITH_RELATIONS = { genres: { include: { genre: true } }, tags: { include: { tag: true } }, languages: { include: { language: true } }, warnings: { include: { warningType: true } }, territories: true } as const;

export const findWithRelations = (id: string) => prisma.content.findUnique({ where: { id }, include: WITH_RELATIONS });

export interface AdminContentFilters {
  search?: string;
  status?: Prisma.EnumContentStatusFilter["equals"];
  visibility?: Prisma.EnumVisibilityFilter["equals"];
  genreId?: string;
  languageId?: string;
  ageRating?: string;
}

/** Section 14/51/52: the admin list for one content type, with the filters/search Phase 4 asks for. */
export function adminListWhere(type: Prisma.ContentWhereInput["type"], filters: AdminContentFilters): Prisma.ContentWhereInput {
  return {
    type,
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.visibility ? { visibility: filters.visibility } : {}),
    ...(filters.ageRating ? { ageRating: filters.ageRating } : {}),
    ...(filters.genreId ? { genres: { some: { genreId: filters.genreId } } } : {}),
    ...(filters.languageId ? { languages: { some: { languageId: filters.languageId } } } : {}),
    ...(filters.search ? { OR: [{ title: { contains: filters.search, mode: "insensitive" } }, { contentCode: { contains: filters.search, mode: "insensitive" } }, { slug: { contains: filters.search, mode: "insensitive" } }] } : {}),
  };
}

export async function adminList(where: Prisma.ContentWhereInput, skip: number, take: number, orderBy: Prisma.ContentOrderByWithRelationInput) {
  const [rows, total] = await Promise.all([prisma.content.findMany({ where, skip, take, orderBy, include: WITH_RELATIONS }), prisma.content.count({ where })]);
  return { rows, total };
}

export const listDrafts = (filters: { type?: Prisma.ContentWhereInput["type"]; search?: string }, skip: number, take: number) =>
  adminList({ status: "DRAFT", type: filters.type, ...(filters.search ? { title: { contains: filters.search, mode: "insensitive" } } : {}) }, skip, take, { updatedAt: "desc" });
