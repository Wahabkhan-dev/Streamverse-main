import { prisma } from "../config/database";

const WITH_TERRITORIES = { territories: true } as const;

export const findMovieForPlayback = (contentId: string) =>
  prisma.movie.findUnique({
    where: { contentId },
    include: { content: { include: WITH_TERRITORIES }, masterAsset: true, posterAsset: true, trailerAsset: true, teaserAsset: true },
  });

export const findEbookForAccess = (contentId: string) =>
  prisma.ebook.findUnique({
    where: { contentId },
    include: { content: { include: WITH_TERRITORIES }, epubAsset: true, pdfAsset: true, frontCoverAsset: true },
  });

export const findAudiobookForPlayback = (contentId: string) =>
  prisma.audiobook.findUnique({
    where: { contentId },
    include: { content: { include: WITH_TERRITORIES }, mainAsset: true, coverAsset: true, chapters: { orderBy: { chapterNumber: "asc" }, include: { audioAsset: true } } },
  });
