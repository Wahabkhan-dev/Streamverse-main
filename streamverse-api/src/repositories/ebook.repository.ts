import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export const create = (client: Prisma.TransactionClient | typeof prisma, contentId: string, data: Omit<Prisma.EbookUncheckedCreateInput, "contentId">) =>
  client.ebook.create({ data: { ...data, contentId } });

export const update = (client: Prisma.TransactionClient | typeof prisma, contentId: string, data: Prisma.EbookUncheckedUpdateInput) => client.ebook.update({ where: { contentId }, data });

export const findByContentId = (contentId: string) => prisma.ebook.findUnique({ where: { contentId }, include: { content: true, editions: { include: { language: true } } } });

const WITH_CONTENT_RELATIONS = { genres: { include: { genre: true } }, tags: { include: { tag: true } }, languages: { include: { language: true } }, warnings: { include: { warningType: true } }, territories: true } as const;

export const findFullByContentId = (contentId: string) =>
  prisma.ebook.findUnique({
    where: { contentId },
    include: {
      content: { include: WITH_CONTENT_RELATIONS },
      editions: { include: { language: true } },
      // Phase 6 (Section 69/70): publish readiness needs each slot's STATUS, not just that an id was set.
      epubAsset: { select: { status: true } },
      pdfAsset: { select: { status: true } },
      frontCoverAsset: { select: { status: true } },
      thumbnailAsset: { select: { status: true } },
    },
  });

export const addEdition = (client: Prisma.TransactionClient | typeof prisma, ebookId: string, data: Omit<Prisma.EbookEditionUncheckedCreateInput, "ebookId" | "languageId">, languageId: string) =>
  client.ebookEdition.create({ data: { ...data, ebookId, languageId } });

export const findEdition = (id: string) => prisma.ebookEdition.findUnique({ where: { id } });
export const updateEdition = (id: string, data: Prisma.EbookEditionUncheckedUpdateInput) => prisma.ebookEdition.update({ where: { id }, data });
export const deleteEdition = (id: string) => prisma.ebookEdition.delete({ where: { id } });
