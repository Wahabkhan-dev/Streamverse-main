import type { ContentStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/database";

const WITH_CONTENT_RELATIONS = { genres: { include: { genre: true } }, tags: { include: { tag: true } }, languages: { include: { language: true } }, warnings: { include: { warningType: true } } } as const;
const WITH_CONTENT_RELATIONS_AND_TERRITORY = { ...WITH_CONTENT_RELATIONS, territories: true } as const;

export interface CustomerContentFilters {
  search?: string | undefined;
  genreId?: string | undefined;
  languageId?: string | undefined;
  ageRating?: string | undefined;
  featured?: boolean | undefined;
  trending?: boolean | undefined;
  popular?: boolean | undefined;
  newRelease?: boolean | undefined;
}

/**
 * Section 2/3: the one filter every customer list/search query starts from — PUBLISHED, not deleted, not
 * HIDDEN, inside its availability window. Nothing customer-facing builds its own version of this.
 */
export function customerVisibleWhere(now = new Date()): Prisma.ContentWhereInput {
  return {
    status: "PUBLISHED" as ContentStatus,
    deletedAt: null,
    visibility: { not: "HIDDEN" },
    AND: [{ OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] }, { OR: [{ availableUntil: null }, { availableUntil: { gte: now } }] }],
  };
}

export function withCustomerFilters(base: Prisma.ContentWhereInput, filters: CustomerContentFilters): Prisma.ContentWhereInput {
  return {
    ...base,
    ...(filters.ageRating ? { ageRating: filters.ageRating } : {}),
    ...(filters.genreId ? { genres: { some: { genreId: filters.genreId } } } : {}),
    ...(filters.languageId ? { languages: { some: { languageId: filters.languageId } } } : {}),
    ...(filters.featured ? { featured: true } : {}),
    ...(filters.trending ? { trending: true } : {}),
    ...(filters.popular ? { popular: true } : {}),
    ...(filters.newRelease ? { newRelease: true } : {}),
    ...(filters.search ? { title: { contains: filters.search } } : {}),
  };
}

export async function listMovies(contentWhere: Prisma.ContentWhereInput, skip: number, take: number, orderBy: Prisma.ContentOrderByWithRelationInput) {
  const where: Prisma.MovieWhereInput = { content: contentWhere };
  const [rows, total] = await Promise.all([
    prisma.movie.findMany({ where, skip, take, orderBy: { content: orderBy }, include: { content: { include: WITH_CONTENT_RELATIONS } } }),
    prisma.movie.count({ where }),
  ]);
  return { rows, total };
}

export async function listEbooks(contentWhere: Prisma.ContentWhereInput, skip: number, take: number, orderBy: Prisma.ContentOrderByWithRelationInput) {
  const where: Prisma.EbookWhereInput = { content: contentWhere };
  const [rows, total] = await Promise.all([
    prisma.ebook.findMany({ where, skip, take, orderBy: { content: orderBy }, include: { content: { include: WITH_CONTENT_RELATIONS } } }),
    prisma.ebook.count({ where }),
  ]);
  return { rows, total };
}

export async function listAudiobooks(contentWhere: Prisma.ContentWhereInput, skip: number, take: number, orderBy: Prisma.ContentOrderByWithRelationInput) {
  const where: Prisma.AudiobookWhereInput = { content: contentWhere };
  const [rows, total] = await Promise.all([
    prisma.audiobook.findMany({ where, skip, take, orderBy: { content: orderBy }, include: { content: { include: WITH_CONTENT_RELATIONS } } }),
    prisma.audiobook.count({ where }),
  ]);
  return { rows, total };
}

export const findMovieBySlug = (slug: string) =>
  prisma.movie.findFirst({
    where: { content: { slug } },
    include: { content: { include: WITH_CONTENT_RELATIONS_AND_TERRITORY }, cast: { orderBy: { displayOrder: "asc" } }, crew: { orderBy: { displayOrder: "asc" } }, captions: { include: { language: true } }, audioTracks: { include: { language: true } } },
  });

export const findEbookBySlug = (slug: string) => prisma.ebook.findFirst({ where: { content: { slug } }, include: { content: { include: WITH_CONTENT_RELATIONS_AND_TERRITORY }, editions: { include: { language: true } } } });

export const findAudiobookBySlug = (slug: string) =>
  prisma.audiobook.findFirst({ where: { content: { slug } }, include: { content: { include: WITH_CONTENT_RELATIONS_AND_TERRITORY }, editions: { include: { language: true } }, chapters: { orderBy: { chapterNumber: "asc" } } } });

/** Used by the related-content service: every customer-visible title of one type, lightly loaded. */
export const listAllVisible = (type: "MOVIE" | "EBOOK" | "AUDIOBOOK", now = new Date()) =>
  prisma.content.findMany({ where: { ...customerVisibleWhere(now), type }, include: WITH_CONTENT_RELATIONS });

/**
 * Section 14: a dynamic homepage section derives from Content flags/dates directly — never a duplicate
 * array kept in sync by hand. `flag` is one of the boolean promotion flags, or "LATEST" to sort by
 * release/publish date instead of filtering by a flag at all.
 */
export function listDynamic(flag: "FEATURED" | "TRENDING" | "POPULAR" | "NEW_RELEASE" | "LATEST", limit: number, now = new Date()) {
  const where = customerVisibleWhere(now);
  if (flag === "LATEST") return prisma.content.findMany({ where, take: limit, orderBy: [{ releaseDate: "desc" }, { publishedAt: "desc" }], include: WITH_CONTENT_RELATIONS });
  const flagField = { FEATURED: "featured", TRENDING: "trending", POPULAR: "popular", NEW_RELEASE: "newRelease" }[flag];
  return prisma.content.findMany({ where: { ...where, [flagField]: true }, take: limit, orderBy: { publishedAt: "desc" }, include: WITH_CONTENT_RELATIONS });
}

/** The cover-ish asset + one headline field for a batch of ids, one query per type (never one per id). */
export async function coverFieldsByContentId(movieIds: string[], ebookIds: string[], audiobookIds: string[]) {
  const [movies, ebooks, audiobooks] = await Promise.all([
    movieIds.length ? prisma.movie.findMany({ where: { contentId: { in: movieIds } }, select: { contentId: true, posterAssetId: true, runtimeMinutes: true } }) : [],
    ebookIds.length ? prisma.ebook.findMany({ where: { contentId: { in: ebookIds } }, select: { contentId: true, frontCoverAssetId: true, author: true } }) : [],
    audiobookIds.length ? prisma.audiobook.findMany({ where: { contentId: { in: audiobookIds } }, select: { contentId: true, coverAssetId: true, author: true, narrator: true } }) : [],
  ]);
  return { movies, ebooks, audiobooks };
}
