import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export const findMovieProgress = (userId: string, movieId: string) => prisma.movieProgress.findUnique({ where: { userId_movieId: { userId, movieId } } });
export const upsertMovieProgress = (userId: string, movieId: string, data: Omit<Prisma.MovieProgressUncheckedCreateInput, "userId" | "movieId">) =>
  prisma.movieProgress.upsert({ where: { userId_movieId: { userId, movieId } }, create: { userId, movieId, ...data }, update: data });
export const listInProgressMovies = (userId: string) => prisma.movieProgress.findMany({ where: { userId, completed: false, positionSeconds: { gt: 0 } }, orderBy: { updatedAt: "desc" }, include: { movie: { include: { content: { include: { genres: { include: { genre: true } }, tags: { include: { tag: true } }, languages: { include: { language: true } }, warnings: { include: { warningType: true } } } } } } } });

export const findEbookProgress = (userId: string, ebookId: string) => prisma.ebookProgress.findUnique({ where: { userId_ebookId: { userId, ebookId } } });
export const upsertEbookProgress = (userId: string, ebookId: string, data: Omit<Prisma.EbookProgressUncheckedCreateInput, "userId" | "ebookId">) =>
  prisma.ebookProgress.upsert({ where: { userId_ebookId: { userId, ebookId } }, create: { userId, ebookId, ...data }, update: data });
export const listInProgressEbooks = (userId: string) => prisma.ebookProgress.findMany({ where: { userId, completed: false, percentage: { gt: 0 } }, orderBy: { updatedAt: "desc" }, include: { ebook: { include: { content: { include: { genres: { include: { genre: true } }, tags: { include: { tag: true } }, languages: { include: { language: true } }, warnings: { include: { warningType: true } } } } } } } });

export const findAudiobookProgress = (userId: string, audiobookId: string) => prisma.audiobookProgress.findUnique({ where: { userId_audiobookId: { userId, audiobookId } } });
export const upsertAudiobookProgress = (userId: string, audiobookId: string, data: Omit<Prisma.AudiobookProgressUncheckedCreateInput, "userId" | "audiobookId">) =>
  prisma.audiobookProgress.upsert({ where: { userId_audiobookId: { userId, audiobookId } }, create: { userId, audiobookId, ...data }, update: data });
export const listInProgressAudiobooks = (userId: string) =>
  prisma.audiobookProgress.findMany({ where: { userId, completed: false, positionSeconds: { gt: 0 } }, orderBy: { updatedAt: "desc" }, include: { audiobook: { include: { content: { include: { genres: { include: { genre: true } }, tags: { include: { tag: true } }, languages: { include: { language: true } }, warnings: { include: { warningType: true } } } } } } } });

export const findChapter = (id: string) => prisma.audiobookChapter.findUnique({ where: { id } });
