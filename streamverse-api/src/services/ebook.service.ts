import type { ContentStatus, Visibility } from "@prisma/client";
import { prisma } from "../config/database";
import * as contentRepository from "../repositories/content.repository";
import * as ebookRepository from "../repositories/ebook.repository";
import { assertNotStale } from "../utils/concurrency";
import { NotFoundError } from "../utils/errors";
import { buildPagination, toSkipTake } from "../utils/pagination";
import type { CreateEbookInput, EbookEditionInput, UpdateEbookEditionInput, UpdateEbookInput } from "../validators/ebook.validator";
import type { AuditContext } from "./auditLog.service";
import { recordAudit } from "./auditLog.service";
import { createContentIn, runInTransaction, updateContentBaseIn } from "./content.service";
import { assertAssetRef, changedSlot, scheduleReplacementCleanup } from "./mediaAsset.service";

const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

type EbookAssetSlots = { epubAssetId?: string | undefined; pdfAssetId?: string | undefined; sampleAssetId?: string | undefined; frontCoverAssetId?: string | undefined; backCoverAssetId?: string | undefined; spineAssetId?: string | undefined; fullWrapAssetId?: string | undefined; thumbnailAssetId?: string | undefined };

async function assertEbookAssetRefs(ebook: EbookAssetSlots, contentId?: string) {
  await Promise.all([
    assertAssetRef("ebook.epubAssetId", ebook.epubAssetId, ["EBOOK_EPUB"], contentId),
    assertAssetRef("ebook.pdfAssetId", ebook.pdfAssetId, ["EBOOK_PDF"], contentId),
    assertAssetRef("ebook.sampleAssetId", ebook.sampleAssetId, ["EBOOK_SAMPLE"], contentId),
    assertAssetRef("ebook.frontCoverAssetId", ebook.frontCoverAssetId, ["EBOOK_FRONT_COVER"], contentId),
    assertAssetRef("ebook.backCoverAssetId", ebook.backCoverAssetId, ["EBOOK_BACK_COVER"], contentId),
    assertAssetRef("ebook.spineAssetId", ebook.spineAssetId, ["EBOOK_SPINE"], contentId),
    assertAssetRef("ebook.fullWrapAssetId", ebook.fullWrapAssetId, ["EBOOK_FULL_WRAP"], contentId),
    assertAssetRef("ebook.thumbnailAssetId", ebook.thumbnailAssetId, ["THUMBNAIL"], contentId),
  ]);
}

const EBOOK_ASSET_FIELDS = ["epubAssetId", "pdfAssetId", "sampleAssetId", "frontCoverAssetId", "backCoverAssetId", "spineAssetId", "fullWrapAssetId", "thumbnailAssetId"] as const;

export async function createEbook(input: CreateEbookInput, ctx: AuditContext = NO_ACTOR) {
  await assertEbookAssetRefs(input.ebook);
  const { content, ebook } = await runInTransaction(async (tx) => {
    const content = await createContentIn(tx, "EBOOK", input, ctx.userId);
    const ebook = await ebookRepository.create(tx, content.id, input.ebook);
    await Promise.all([
      contentRepository.addGenres(tx, content.id, input.genreIds),
      contentRepository.addTags(tx, content.id, input.tagIds),
      contentRepository.addWarnings(tx, content.id, input.warningTypeIds),
      contentRepository.addLanguages(tx, content.id, input.languages),
      contentRepository.addTerritories(tx, content.id, input.territory?.countryCodes ?? []),
    ]);
    return { content, ebook };
  });
  await recordAudit(ctx, { action: "content.created", entityType: "EBOOK", entityId: content.id, metadata: { contentCode: content.contentCode, title: content.title } });
  return { content, ebook };
}

export async function updateEbook(contentId: string, input: UpdateEbookInput, ctx: AuditContext = NO_ACTOR) {
  if (input.ebook) await assertEbookAssetRefs(input.ebook, contentId);

  const existing = await contentRepository.findActiveById(contentId);
  if (!existing) throw new NotFoundError("eBook not found");
  assertNotStale(existing.updatedAt, input.expectedUpdatedAt);

  const previousEbook = input.ebook ? await ebookRepository.findByContentId(contentId) : null;

  await runInTransaction(async (tx) => {
    await updateContentBaseIn(tx, contentId, input);
    if (Object.keys(input.ebook ?? {}).length) await ebookRepository.update(tx, contentId, input.ebook!);
    if (input.genreIds !== undefined) await contentRepository.replaceGenres(tx, contentId, input.genreIds);
    if (input.tagIds !== undefined) await contentRepository.replaceTags(tx, contentId, input.tagIds);
    if (input.warningTypeIds !== undefined) await contentRepository.replaceWarnings(tx, contentId, input.warningTypeIds);
    if (input.languages !== undefined) await contentRepository.replaceLanguages(tx, contentId, input.languages);
  });

  if (previousEbook && input.ebook) {
    await Promise.all(EBOOK_ASSET_FIELDS.map((field) => scheduleReplacementCleanup(changedSlot(previousEbook[field], input.ebook![field]), input.ebook![field])));
  }

  await recordAudit(ctx, { action: "content.updated", entityType: "EBOOK", entityId: contentId, metadata: { fields: Object.keys(input).filter((k) => k !== "expectedUpdatedAt") } });
  return getFullEbook(contentId);
}

export async function getFullEbook(contentId: string) {
  const full = await ebookRepository.findFullByContentId(contentId);
  if (!full || full.content.deletedAt) throw new NotFoundError("eBook not found");
  return full;
}
export const getEbook = (contentId: string) => ebookRepository.findByContentId(contentId);

export interface ListFilters {
  page: number;
  limit: number;
  sortBy: "title" | "createdAt" | "updatedAt" | "publishedAt" | "status";
  sortOrder: "asc" | "desc";
  search?: string | undefined;
  status?: ContentStatus | undefined;
  visibility?: Visibility | undefined;
  genreId?: string | undefined;
  languageId?: string | undefined;
  ageRating?: string | undefined;
}

export async function listEbooks(filters: ListFilters) {
  const where = contentRepository.adminListWhere("EBOOK", filters);
  const { skip, take } = toSkipTake(filters.page, filters.limit);
  const { rows, total } = await contentRepository.adminList(where, skip, take, { [filters.sortBy]: filters.sortOrder });
  return { rows, pagination: buildPagination(total, filters.page, filters.limit) };
}

/* ---------------------------------------------------------------- editions (Section 9) */

export async function addEdition(ebookId: string, input: EbookEditionInput, ctx: AuditContext = NO_ACTOR) {
  await Promise.all([assertAssetRef("epubAssetId", input.epubAssetId, ["EBOOK_EPUB"], ebookId), assertAssetRef("pdfAssetId", input.pdfAssetId, ["EBOOK_PDF"], ebookId), assertAssetRef("coverAssetId", input.coverAssetId, ["EBOOK_FRONT_COVER"], ebookId)]);
  if (!(await contentRepository.findActiveById(ebookId))) throw new NotFoundError("eBook not found");
  const edition = await ebookRepository.addEdition(prisma, ebookId, { translatedTitle: input.translatedTitle, translator: input.translator, epubAssetId: input.epubAssetId, pdfAssetId: input.pdfAssetId, coverAssetId: input.coverAssetId }, input.languageId);
  await recordAudit(ctx, { action: "content.edition_added", entityType: "EBOOK", entityId: ebookId, metadata: { editionId: edition.id, languageId: input.languageId } });
  return edition;
}

async function assertEditionBelongsTo(ebookId: string, editionId: string) {
  const edition = await ebookRepository.findEdition(editionId);
  if (!edition || edition.ebookId !== ebookId) throw new NotFoundError("Edition not found for this eBook");
  return edition;
}

export async function updateEdition(ebookId: string, editionId: string, input: UpdateEbookEditionInput, ctx: AuditContext = NO_ACTOR) {
  await assertEditionBelongsTo(ebookId, editionId);
  await Promise.all([assertAssetRef("epubAssetId", input.epubAssetId, ["EBOOK_EPUB"], ebookId), assertAssetRef("pdfAssetId", input.pdfAssetId, ["EBOOK_PDF"], ebookId), assertAssetRef("coverAssetId", input.coverAssetId, ["EBOOK_FRONT_COVER"], ebookId)]);
  const updated = await ebookRepository.updateEdition(editionId, input);
  await recordAudit(ctx, { action: "content.edition_updated", entityType: "EBOOK", entityId: ebookId, metadata: { editionId } });
  return updated;
}

export async function deleteEdition(ebookId: string, editionId: string, ctx: AuditContext = NO_ACTOR) {
  await assertEditionBelongsTo(ebookId, editionId);
  await ebookRepository.deleteEdition(editionId);
  await recordAudit(ctx, { action: "content.edition_deleted", entityType: "EBOOK", entityId: ebookId, metadata: { editionId } });
}
