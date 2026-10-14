import type { LegalDocType, Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export const findByType = (type: LegalDocType) => prisma.legalDocument.findUnique({ where: { type }, include: { currentPublishedVersion: true, currentDraftVersion: true } });

export const createDocument = (type: LegalDocType, title: string, slug: string) => prisma.legalDocument.create({ data: { type, title, slug } });

export const createVersion = (client: Prisma.TransactionClient | typeof prisma, legalDocumentId: string, data: Omit<Prisma.LegalDocumentVersionUncheckedCreateInput, "legalDocumentId">) =>
  client.legalDocumentVersion.create({ data: { ...data, legalDocumentId } });

export const updateVersion = (client: Prisma.TransactionClient | typeof prisma, id: string, data: Prisma.LegalDocumentVersionUpdateInput) => client.legalDocumentVersion.update({ where: { id }, data });

export const setDraftPointer = (client: Prisma.TransactionClient | typeof prisma, documentId: string, versionId: string | null) =>
  client.legalDocument.update({ where: { id: documentId }, data: { currentDraftVersionId: versionId } });

export const setPublishedPointer = (client: Prisma.TransactionClient | typeof prisma, documentId: string, versionId: string) =>
  client.legalDocument.update({ where: { id: documentId }, data: { currentPublishedVersionId: versionId } });

export const runInTransaction = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn);

/** Section 41: full version history for one document type, most recent first. Nothing here is ever deleted. */
export async function listVersionsForType(type: LegalDocType) {
  const doc = await findByType(type);
  if (!doc) return [];
  return prisma.legalDocumentVersion.findMany({ where: { legalDocumentId: doc.id }, orderBy: { createdAt: "desc" }, include: { createdBy: { select: { id: true, fullName: true, email: true } } } });
}
