import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export const create = (client: Prisma.TransactionClient | typeof prisma, contentId: string, data: Omit<Prisma.AudiobookUncheckedCreateInput, "contentId">) =>
  client.audiobook.create({ data: { ...data, contentId } });

export const update = (client: Prisma.TransactionClient | typeof prisma, contentId: string, data: Prisma.AudiobookUncheckedUpdateInput) => client.audiobook.update({ where: { contentId }, data });

export const findByContentId = (contentId: string) =>
  prisma.audiobook.findUnique({ where: { contentId }, include: { content: true, editions: { include: { language: true } }, chapters: { orderBy: { chapterNumber: "asc" } } } });

const WITH_CONTENT_RELATIONS = { genres: { include: { genre: true } }, tags: { include: { tag: true } }, languages: { include: { language: true } }, warnings: { include: { warningType: true } }, territories: true } as const;

export const findFullByContentId = (contentId: string) =>
  prisma.audiobook.findUnique({
    where: { contentId },
    include: {
      content: { include: WITH_CONTENT_RELATIONS },
      editions: { include: { language: true } },
      // Phase 6 (Section 69/70): publish readiness needs each slot's STATUS, not just that an id was set.
      chapters: { orderBy: { chapterNumber: "asc" }, include: { audioAsset: { select: { status: true } } } },
      mainAsset: { select: { status: true } },
      coverAsset: { select: { status: true } },
      thumbnailAsset: { select: { status: true } },
    },
  });

export const addEdition = (
  client: Prisma.TransactionClient | typeof prisma,
  audiobookId: string,
  data: Omit<Prisma.AudiobookEditionUncheckedCreateInput, "audiobookId" | "languageId">,
  languageId: string,
) => client.audiobookEdition.create({ data: { ...data, audiobookId, languageId } });

export const findEdition = (id: string) => prisma.audiobookEdition.findUnique({ where: { id } });
export const updateEdition = (id: string, data: Prisma.AudiobookEditionUncheckedUpdateInput) => prisma.audiobookEdition.update({ where: { id }, data });
export const deleteEdition = (id: string) => prisma.audiobookEdition.delete({ where: { id } });

export const addChapter = (client: Prisma.TransactionClient | typeof prisma, audiobookId: string, data: Omit<Prisma.AudiobookChapterUncheckedCreateInput, "audiobookId">) =>
  client.audiobookChapter.create({ data: { ...data, audiobookId } });

export const findChapter = (id: string) => prisma.audiobookChapter.findUnique({ where: { id } });
export const updateChapter = (id: string, data: Prisma.AudiobookChapterUncheckedUpdateInput) => prisma.audiobookChapter.update({ where: { id }, data });
export const deleteChapter = (id: string) => prisma.audiobookChapter.delete({ where: { id } });
export const listChapters = (audiobookId: string) => prisma.audiobookChapter.findMany({ where: { audiobookId }, orderBy: { chapterNumber: "asc" } });

export const chapterNumberTaken = async (audiobookId: string, chapterNumber: number, excludeId?: string) =>
  (await prisma.audiobookChapter.count({ where: { audiobookId, chapterNumber, ...(excludeId ? { id: { not: excludeId } } : {}) } })) > 0;

export const reorderChapters = (client: Prisma.TransactionClient, rows: { id: string; displayOrder: number }[]) => Promise.all(rows.map((r) => client.audiobookChapter.update({ where: { id: r.id }, data: { displayOrder: r.displayOrder } })));
