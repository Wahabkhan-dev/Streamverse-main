import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export const create = (client: Prisma.TransactionClient | typeof prisma, contentId: string, data: Omit<Prisma.MovieUncheckedCreateInput, "contentId">) =>
  client.movie.create({ data: { ...data, contentId } });

export const update = (client: Prisma.TransactionClient | typeof prisma, contentId: string, data: Prisma.MovieUncheckedUpdateInput) => client.movie.update({ where: { contentId }, data });

export const findByContentId = (contentId: string) =>
  prisma.movie.findUnique({ where: { contentId }, include: { content: true, cast: { orderBy: { displayOrder: "asc" } }, crew: { orderBy: { displayOrder: "asc" } }, captions: true, audioTracks: true } });

const WITH_CONTENT_RELATIONS = { genres: { include: { genre: true } }, tags: { include: { tag: true } }, languages: { include: { language: true } }, warnings: { include: { warningType: true } }, territories: true } as const;

/** The full admin edit payload (Section 6): Content + its shared relations + every movie-only piece, in one query. */
export const findFullByContentId = (contentId: string) =>
  prisma.movie.findUnique({
    where: { contentId },
    include: {
      content: { include: WITH_CONTENT_RELATIONS },
      cast: { orderBy: { displayOrder: "asc" } },
      crew: { orderBy: { displayOrder: "asc" } },
      captions: { include: { language: true } },
      audioTracks: { include: { language: true } },
      // Phase 6 (Section 69/70): publish readiness needs each slot's STATUS, not just that an id was set.
      posterAsset: { select: { status: true } },
      backdropAsset: { select: { status: true } },
      thumbnailAsset: { select: { status: true } },
      masterAsset: { select: { status: true } },
    },
  });

export const addCast = (client: Prisma.TransactionClient | typeof prisma, movieId: string, rows: { name: string; characterName?: string | undefined; displayOrder: number }[]) =>
  rows.length ? client.movieCast.createMany({ data: rows.map((r) => ({ ...r, movieId })) }) : Promise.resolve({ count: 0 });

export const addCrew = (client: Prisma.TransactionClient | typeof prisma, movieId: string, rows: { name: string; role: Prisma.MovieCrewCreateInput["role"]; displayOrder: number }[]) =>
  rows.length ? client.movieCrew.createMany({ data: rows.map((r) => ({ ...r, movieId })) }) : Promise.resolve({ count: 0 });

export const addCaptions = (client: Prisma.TransactionClient | typeof prisma, movieId: string, rows: { languageId: string; type: Prisma.MovieCaptionCreateInput["type"]; mediaAssetId?: string | undefined }[]) =>
  rows.length ? client.movieCaption.createMany({ data: rows.map((r) => ({ ...r, movieId })) }) : Promise.resolve({ count: 0 });

export const addAudioTracks = (client: Prisma.TransactionClient | typeof prisma, movieId: string, rows: { languageId: string; mediaAssetId?: string | undefined }[]) =>
  rows.length ? client.movieAudioTrack.createMany({ data: rows.map((r) => ({ ...r, movieId })) }) : Promise.resolve({ count: 0 });

/** Section 48/49: cast/crew/captions/audio tracks are replace-all on every update — one consistent strategy, never appended. */
export async function replaceCast(tx: Prisma.TransactionClient, movieId: string, rows: { name: string; characterName?: string | undefined; displayOrder: number }[]) {
  await tx.movieCast.deleteMany({ where: { movieId } });
  await addCast(tx, movieId, rows);
}
export async function replaceCrew(tx: Prisma.TransactionClient, movieId: string, rows: { name: string; role: Prisma.MovieCrewCreateInput["role"]; displayOrder: number }[]) {
  await tx.movieCrew.deleteMany({ where: { movieId } });
  await addCrew(tx, movieId, rows);
}
export async function replaceCaptions(tx: Prisma.TransactionClient, movieId: string, rows: { languageId: string; type: Prisma.MovieCaptionCreateInput["type"]; mediaAssetId?: string | undefined }[]) {
  await tx.movieCaption.deleteMany({ where: { movieId } });
  await addCaptions(tx, movieId, rows);
}
export async function replaceAudioTracks(tx: Prisma.TransactionClient, movieId: string, rows: { languageId: string; mediaAssetId?: string | undefined }[]) {
  await tx.movieAudioTrack.deleteMany({ where: { movieId } });
  await addAudioTracks(tx, movieId, rows);
}
