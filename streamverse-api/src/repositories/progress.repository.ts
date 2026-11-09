import { Prisma, type AudiobookProgress, type EbookProgress, type MovieProgress } from "@prisma/client";
import { prisma } from "../config/database";

export const findMovieProgress = (userId: string, movieId: string) => prisma.movieProgress.findUnique({ where: { userId_movieId: { userId, movieId } } });
export const upsertMovieProgress = (userId: string, movieId: string, data: Omit<Prisma.MovieProgressUncheckedCreateInput, "userId" | "movieId">) =>
  prisma.movieProgress.upsert({ where: { userId_movieId: { userId, movieId } }, create: { userId, movieId, ...data }, update: data });

/** Continue Watching: only this user's in-progress rows (id + how far), newest first — the titles' cards come from the card cache. */
export const listInProgressMovieRefs = (userId: string) =>
  prisma.movieProgress.findMany({ where: { userId, completed: false, positionSeconds: { gt: 0 } }, orderBy: { updatedAt: "desc" }, select: { movieId: true, percentage: true } });
export const listInProgressEbookRefs = (userId: string) =>
  prisma.ebookProgress.findMany({ where: { userId, completed: false, percentage: { gt: 0 } }, orderBy: { updatedAt: "desc" }, select: { ebookId: true, percentage: true } });
export const listInProgressAudiobookRefs = (userId: string) =>
  prisma.audiobookProgress.findMany({ where: { userId, completed: false, positionSeconds: { gt: 0 } }, orderBy: { updatedAt: "desc" }, select: { audiobookId: true, percentage: true } });

export const findEbookProgress = (userId: string, ebookId: string) => prisma.ebookProgress.findUnique({ where: { userId_ebookId: { userId, ebookId } } });
export const upsertEbookProgress = (userId: string, ebookId: string, data: Omit<Prisma.EbookProgressUncheckedCreateInput, "userId" | "ebookId">) =>
  prisma.ebookProgress.upsert({ where: { userId_ebookId: { userId, ebookId } }, create: { userId, ebookId, ...data }, update: data });

export const findAudiobookProgress = (userId: string, audiobookId: string) => prisma.audiobookProgress.findUnique({ where: { userId_audiobookId: { userId, audiobookId } } });
export const upsertAudiobookProgress = (userId: string, audiobookId: string, data: Omit<Prisma.AudiobookProgressUncheckedCreateInput, "userId" | "audiobookId">) =>
  prisma.audiobookProgress.upsert({ where: { userId_audiobookId: { userId, audiobookId } }, create: { userId, audiobookId, ...data }, update: data });

export const findChapter = (id: string) => prisma.audiobookChapter.findUnique({ where: { id } });

/* ------------------------------------------------------------------------------------------------ fast progress writes */

const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === "P2002";
/** Prisma treats `undefined` as "leave unchanged", so the returned row must too. */
const definedOnly = <T extends object>(data: T) => Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as Partial<T>;

/** Fixed table/column names (never from input) for the single-statement update below. */
const PROGRESS_TABLES = {
  MovieProgress: { key: "movieId", columns: ["positionSeconds", "durationSeconds", "percentage", "completed"] },
  EbookProgress: { key: "ebookId", columns: ["location", "page", "percentage", "completed"] },
  AudiobookProgress: { key: "audiobookId", columns: ["chapterId", "positionSeconds", "percentage", "completed"] },
} as const;
const ident = (name: string) => Prisma.raw(`\`${name}\``);

/**
 * ONE parameterised UPDATE. Prisma's own update/updateMany on MySQL is wrapped in BEGIN … COMMIT — three round trips for a
 * single row — and this runs every few seconds for every viewer. Returns the number of rows changed.
 */
function updateProgressRow(table: keyof typeof PROGRESS_TABLES, userId: string, id: string, data: Record<string, unknown>, updatedAt: Date) {
  const spec = PROGRESS_TABLES[table];
  const sets = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([column, value]) => {
      if (!(spec.columns as readonly string[]).includes(column)) throw new Error(`progress: unexpected column ${column}`);
      return Prisma.sql`${ident(column)} = ${value}`;
    });
  sets.push(Prisma.sql`\`updatedAt\` = ${updatedAt}`);
  return prisma.$executeRaw`UPDATE ${ident(table)} SET ${Prisma.join(sets)} WHERE \`userId\` = ${userId} AND ${ident(spec.key)} = ${id}`;
}

/**
 * Progress is saved every few seconds while something plays. Prisma's upsert on MySQL is a transaction (begin, select,
 * update, select, commit); the caller has already read the row, so:
 *   - row exists → ONE UPDATE, and the row returned is exactly what was written (same timestamp included);
 *   - no row yet → one INSERT;
 *   - anything unexpected in between (a parallel first save, the row removed meanwhile) → the original upsert, so no save is lost.
 */
async function writeProgress<Row extends object, Data extends object>(
  table: keyof typeof PROGRESS_TABLES,
  userId: string,
  id: string,
  existing: Row | null,
  data: Data,
  ops: { create: () => Promise<Row>; upsert: () => Promise<Row> },
): Promise<Row> {
  if (existing) {
    const updatedAt = new Date();
    if ((await updateProgressRow(table, userId, id, data as Record<string, unknown>, updatedAt)) === 1) return { ...existing, ...definedOnly(data), updatedAt } as Row;
  } else {
    try {
      return await ops.create();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  return ops.upsert();
}

type MovieData = Omit<Prisma.MovieProgressUncheckedCreateInput, "userId" | "movieId">;
export const writeMovieProgress = (userId: string, movieId: string, existing: MovieProgress | null, data: MovieData) =>
  writeProgress("MovieProgress", userId, movieId, existing, data, {
    create: () => prisma.movieProgress.create({ data: { userId, movieId, ...data } }),
    upsert: () => upsertMovieProgress(userId, movieId, data),
  });

type EbookData = Omit<Prisma.EbookProgressUncheckedCreateInput, "userId" | "ebookId">;
export const writeEbookProgress = (userId: string, ebookId: string, existing: EbookProgress | null, data: EbookData) =>
  writeProgress("EbookProgress", userId, ebookId, existing, data, {
    create: () => prisma.ebookProgress.create({ data: { userId, ebookId, ...data } }),
    upsert: () => upsertEbookProgress(userId, ebookId, data),
  });

type AudiobookData = Omit<Prisma.AudiobookProgressUncheckedCreateInput, "userId" | "audiobookId">;
export const writeAudiobookProgress = (userId: string, audiobookId: string, existing: AudiobookProgress | null, data: AudiobookData) =>
  writeProgress("AudiobookProgress", userId, audiobookId, existing, data, {
    create: () => prisma.audiobookProgress.create({ data: { userId, audiobookId, ...data } }),
    upsert: () => upsertAudiobookProgress(userId, audiobookId, data),
  });
