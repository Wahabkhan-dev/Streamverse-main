import type { ContentType, Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { customerVisibleWhere } from "./catalog.repository";

const WITH_CONTENT_RELATIONS = { genres: { include: { genre: true } }, tags: { include: { tag: true } }, languages: { include: { language: true } }, warnings: { include: { warningType: true } } } as const;

export interface SearchFilters {
  genreId?: string | undefined;
  languageId?: string | undefined;
  ageRating?: string | undefined;
}

/**
 * Section 20/21: one Prisma-safe query, parameterized throughout (no string concatenation, no raw SQL) —
 * searches title, genre names, movie cast/crew names, and eBook/audiobook author/co-author/narrator, all
 * in the single `contains` the client sent (normalized to a bounded length by the validator).
 */
export function buildSearchWhere(type: ContentType | undefined, q: string, filters: SearchFilters, now = new Date()): Prisma.ContentWhereInput {
  const contains = { contains: q, mode: "insensitive" as const };
  return {
    ...customerVisibleWhere(now),
    ...(type ? { type } : {}),
    ...(filters.genreId ? { genres: { some: { genreId: filters.genreId } } } : {}),
    ...(filters.languageId ? { languages: { some: { languageId: filters.languageId } } } : {}),
    ...(filters.ageRating ? { ageRating: filters.ageRating } : {}),
    OR: [
      { title: contains },
      { genres: { some: { genre: { name: contains } } } },
      { movie: { cast: { some: { name: contains } } } },
      { movie: { crew: { some: { name: contains } } } },
      { ebook: { author: contains } },
      { ebook: { coAuthor: contains } },
      { audiobook: { author: contains } },
      { audiobook: { narrator: contains } },
    ],
  };
}

export async function searchContent(type: ContentType | undefined, q: string, filters: SearchFilters, skip: number, take: number) {
  const where = buildSearchWhere(type, q, filters);
  const [rows, total] = await Promise.all([
    prisma.content.findMany({ where, skip, take, orderBy: { publishedAt: "desc" }, include: WITH_CONTENT_RELATIONS }),
    prisma.content.count({ where }),
  ]);
  return { rows, total };
}

export interface PersonMatch {
  name: string;
  role: "Actor" | "Director" | "Writer" | "Producer" | "Author" | "Narrator";
  content: { id: string; slug: string; title: string; type: ContentType };
}

/** Section 20: people — actors/directors/writers/producers (movies) and authors/narrators (books). */
export async function searchPeople(q: string, limit: number, now = new Date()): Promise<PersonMatch[]> {
  const contains = { contains: q, mode: "insensitive" as const };
  const visible = customerVisibleWhere(now);

  const [cast, crew, ebooks, audiobooks] = await Promise.all([
    prisma.movieCast.findMany({ where: { name: contains, movie: { content: visible } }, take: limit, include: { movie: { include: { content: true } } } }),
    prisma.movieCrew.findMany({ where: { name: contains, movie: { content: visible } }, take: limit, include: { movie: { include: { content: true } } } }),
    prisma.ebook.findMany({ where: { content: visible, OR: [{ author: contains }, { coAuthor: contains }] }, take: limit, include: { content: true } }),
    prisma.audiobook.findMany({ where: { content: visible, OR: [{ author: contains }, { narrator: contains }] }, take: limit, include: { content: true } }),
  ]);

  const ROLE_MAP: Record<string, PersonMatch["role"]> = { DIRECTOR: "Director", WRITER: "Writer", PRODUCER: "Producer" };
  const out: PersonMatch[] = [];
  for (const c of cast) out.push({ name: c.name, role: "Actor", content: { id: c.movie.content.id, slug: c.movie.content.slug, title: c.movie.content.title, type: "MOVIE" } });
  for (const c of crew) if (ROLE_MAP[c.role]) out.push({ name: c.name, role: ROLE_MAP[c.role]!, content: { id: c.movie.content.id, slug: c.movie.content.slug, title: c.movie.content.title, type: "MOVIE" } });
  for (const b of ebooks) {
    if (b.author && b.author.toLowerCase().includes(q.toLowerCase())) out.push({ name: b.author, role: "Author", content: { id: b.content.id, slug: b.content.slug, title: b.content.title, type: "EBOOK" } });
    if (b.coAuthor && b.coAuthor.toLowerCase().includes(q.toLowerCase())) out.push({ name: b.coAuthor, role: "Author", content: { id: b.content.id, slug: b.content.slug, title: b.content.title, type: "EBOOK" } });
  }
  for (const b of audiobooks) {
    if (b.author && b.author.toLowerCase().includes(q.toLowerCase())) out.push({ name: b.author, role: "Author", content: { id: b.content.id, slug: b.content.slug, title: b.content.title, type: "AUDIOBOOK" } });
    if (b.narrator && b.narrator.toLowerCase().includes(q.toLowerCase())) out.push({ name: b.narrator, role: "Narrator", content: { id: b.content.id, slug: b.content.slug, title: b.content.title, type: "AUDIOBOOK" } });
  }
  return out;
}
