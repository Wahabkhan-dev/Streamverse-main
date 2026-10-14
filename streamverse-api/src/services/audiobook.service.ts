import type { ContentStatus, Visibility } from "@prisma/client";
import { prisma } from "../config/database";
import * as audiobookRepository from "../repositories/audiobook.repository";
import * as contentRepository from "../repositories/content.repository";
import { assertNotStale } from "../utils/concurrency";
import { ConflictError, NotFoundError } from "../utils/errors";
import { buildPagination, toSkipTake } from "../utils/pagination";
import type { AudiobookChapterInput, AudiobookEditionInput, CreateAudiobookInput, UpdateAudiobookChapterInput, UpdateAudiobookEditionInput, UpdateAudiobookInput } from "../validators/audiobook.validator";
import type { AuditContext } from "./auditLog.service";
import { recordAudit } from "./auditLog.service";
import { createContentIn, runInTransaction, updateContentBaseIn } from "./content.service";
import { assertAssetRef, changedSlot, scheduleReplacementCleanup } from "./mediaAsset.service";

const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

type AudiobookAssetSlots = { mainAssetId?: string | undefined; previewAssetId?: string | undefined; coverAssetId?: string | undefined; thumbnailAssetId?: string | undefined };

async function assertAudiobookAssetRefs(a: AudiobookAssetSlots, contentId?: string) {
  await Promise.all([
    assertAssetRef("audiobook.mainAssetId", a.mainAssetId, ["AUDIOBOOK_FILE"], contentId),
    assertAssetRef("audiobook.previewAssetId", a.previewAssetId, ["AUDIOBOOK_PREVIEW"], contentId),
    assertAssetRef("audiobook.coverAssetId", a.coverAssetId, ["AUDIOBOOK_COVER"], contentId),
    assertAssetRef("audiobook.thumbnailAssetId", a.thumbnailAssetId, ["THUMBNAIL"], contentId),
  ]);
}

const AUDIOBOOK_ASSET_FIELDS = ["mainAssetId", "previewAssetId", "coverAssetId", "thumbnailAssetId"] as const;

export async function createAudiobook(input: CreateAudiobookInput, ctx: AuditContext = NO_ACTOR) {
  await assertAudiobookAssetRefs(input.audiobook);
  const { content, audiobook } = await runInTransaction(async (tx) => {
    const content = await createContentIn(tx, "AUDIOBOOK", input, ctx.userId);
    const audiobook = await audiobookRepository.create(tx, content.id, input.audiobook);
    await Promise.all([
      contentRepository.addGenres(tx, content.id, input.genreIds),
      contentRepository.addTags(tx, content.id, input.tagIds),
      contentRepository.addWarnings(tx, content.id, input.warningTypeIds),
      contentRepository.addLanguages(tx, content.id, input.languages),
      contentRepository.addTerritories(tx, content.id, input.territory?.countryCodes ?? []),
    ]);
    return { content, audiobook };
  });
  await recordAudit(ctx, { action: "content.created", entityType: "AUDIOBOOK", entityId: content.id, metadata: { contentCode: content.contentCode, title: content.title } });
  return { content, audiobook };
}

export async function updateAudiobook(contentId: string, input: UpdateAudiobookInput, ctx: AuditContext = NO_ACTOR) {
  if (input.audiobook) await assertAudiobookAssetRefs(input.audiobook, contentId);

  const existing = await contentRepository.findActiveById(contentId);
  if (!existing) throw new NotFoundError("Audiobook not found");
  assertNotStale(existing.updatedAt, input.expectedUpdatedAt);

  const previousAudiobook = input.audiobook ? await audiobookRepository.findByContentId(contentId) : null;

  await runInTransaction(async (tx) => {
    await updateContentBaseIn(tx, contentId, input);
    if (Object.keys(input.audiobook ?? {}).length) await audiobookRepository.update(tx, contentId, input.audiobook!);
    if (input.genreIds !== undefined) await contentRepository.replaceGenres(tx, contentId, input.genreIds);
    if (input.tagIds !== undefined) await contentRepository.replaceTags(tx, contentId, input.tagIds);
    if (input.warningTypeIds !== undefined) await contentRepository.replaceWarnings(tx, contentId, input.warningTypeIds);
    if (input.languages !== undefined) await contentRepository.replaceLanguages(tx, contentId, input.languages);
  });

  if (previousAudiobook && input.audiobook) {
    await Promise.all(AUDIOBOOK_ASSET_FIELDS.map((field) => scheduleReplacementCleanup(changedSlot(previousAudiobook[field], input.audiobook![field]), input.audiobook![field])));
  }

  await recordAudit(ctx, { action: "content.updated", entityType: "AUDIOBOOK", entityId: contentId, metadata: { fields: Object.keys(input).filter((k) => k !== "expectedUpdatedAt") } });
  return getFullAudiobook(contentId);
}

export async function getFullAudiobook(contentId: string) {
  const full = await audiobookRepository.findFullByContentId(contentId);
  if (!full || full.content.deletedAt) throw new NotFoundError("Audiobook not found");
  return full;
}
export const getAudiobook = (contentId: string) => audiobookRepository.findByContentId(contentId);

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

export async function listAudiobooks(filters: ListFilters) {
  const where = contentRepository.adminListWhere("AUDIOBOOK", filters);
  const { skip, take } = toSkipTake(filters.page, filters.limit);
  const { rows, total } = await contentRepository.adminList(where, skip, take, { [filters.sortBy]: filters.sortOrder });
  return { rows, pagination: buildPagination(total, filters.page, filters.limit) };
}

/* ---------------------------------------------------------------- editions (Section 13) */

export async function addEdition(audiobookId: string, input: AudiobookEditionInput, ctx: AuditContext = NO_ACTOR) {
  await Promise.all([assertAssetRef("narratorImageAssetId", input.narratorImageAssetId, ["NARRATOR_IMAGE"], audiobookId), assertAssetRef("audioAssetId", input.audioAssetId, ["AUDIOBOOK_FILE"], audiobookId)]);
  if (!(await contentRepository.findActiveById(audiobookId))) throw new NotFoundError("Audiobook not found");
  const edition = await audiobookRepository.addEdition(prisma, audiobookId, { narrator: input.narrator, narratorBio: input.narratorBio, narratorImageAssetId: input.narratorImageAssetId, audioAssetId: input.audioAssetId }, input.languageId);
  await recordAudit(ctx, { action: "content.edition_added", entityType: "AUDIOBOOK", entityId: audiobookId, metadata: { editionId: edition.id, languageId: input.languageId } });
  return edition;
}

async function assertEditionBelongsTo(audiobookId: string, editionId: string) {
  const edition = await audiobookRepository.findEdition(editionId);
  if (!edition || edition.audiobookId !== audiobookId) throw new NotFoundError("Edition not found for this audiobook");
  return edition;
}

export async function updateEdition(audiobookId: string, editionId: string, input: UpdateAudiobookEditionInput, ctx: AuditContext = NO_ACTOR) {
  await assertEditionBelongsTo(audiobookId, editionId);
  await Promise.all([assertAssetRef("narratorImageAssetId", input.narratorImageAssetId, ["NARRATOR_IMAGE"], audiobookId), assertAssetRef("audioAssetId", input.audioAssetId, ["AUDIOBOOK_FILE"], audiobookId)]);
  const updated = await audiobookRepository.updateEdition(editionId, input);
  await recordAudit(ctx, { action: "content.edition_updated", entityType: "AUDIOBOOK", entityId: audiobookId, metadata: { editionId } });
  return updated;
}

export async function deleteEdition(audiobookId: string, editionId: string, ctx: AuditContext = NO_ACTOR) {
  await assertEditionBelongsTo(audiobookId, editionId);
  await audiobookRepository.deleteEdition(editionId);
  await recordAudit(ctx, { action: "content.edition_deleted", entityType: "AUDIOBOOK", entityId: audiobookId, metadata: { editionId } });
}

/* ---------------------------------------------------------------- chapters (Section 12) */

async function assertChapterBelongsTo(audiobookId: string, chapterId: string) {
  const chapter = await audiobookRepository.findChapter(chapterId);
  if (!chapter || chapter.audiobookId !== audiobookId) throw new NotFoundError("Chapter not found for this audiobook");
  return chapter;
}

export async function addChapter(audiobookId: string, input: AudiobookChapterInput, ctx: AuditContext = NO_ACTOR) {
  if (!(await contentRepository.findActiveById(audiobookId))) throw new NotFoundError("Audiobook not found");
  await assertAssetRef("audioAssetId", input.audioAssetId, ["AUDIOBOOK_CHAPTER"], audiobookId);
  if (await audiobookRepository.chapterNumberTaken(audiobookId, input.chapterNumber)) throw new ConflictError(`Chapter ${input.chapterNumber} already exists for this audiobook.`);
  const chapter = await audiobookRepository.addChapter(prisma, audiobookId, input);
  await recordAudit(ctx, { action: "content.chapter_added", entityType: "AUDIOBOOK", entityId: audiobookId, metadata: { chapterId: chapter.id, chapterNumber: input.chapterNumber } });
  return chapter;
}

export async function updateChapter(audiobookId: string, chapterId: string, input: UpdateAudiobookChapterInput, ctx: AuditContext = NO_ACTOR) {
  await assertChapterBelongsTo(audiobookId, chapterId);
  await assertAssetRef("audioAssetId", input.audioAssetId, ["AUDIOBOOK_CHAPTER"], audiobookId);
  if (input.chapterNumber !== undefined && (await audiobookRepository.chapterNumberTaken(audiobookId, input.chapterNumber, chapterId))) {
    throw new ConflictError(`Chapter ${input.chapterNumber} already exists for this audiobook.`);
  }
  const updated = await audiobookRepository.updateChapter(chapterId, input);
  await recordAudit(ctx, { action: "content.chapter_updated", entityType: "AUDIOBOOK", entityId: audiobookId, metadata: { chapterId } });
  return updated;
}

export async function deleteChapter(audiobookId: string, chapterId: string, ctx: AuditContext = NO_ACTOR) {
  await assertChapterBelongsTo(audiobookId, chapterId);
  await audiobookRepository.deleteChapter(chapterId);
  await recordAudit(ctx, { action: "content.chapter_deleted", entityType: "AUDIOBOOK", entityId: audiobookId, metadata: { chapterId } });
}

/** Section 50: every id must belong to this audiobook, checked before any row is touched. */
export async function reorderChapters(audiobookId: string, items: { id: string; displayOrder: number }[], ctx: AuditContext = NO_ACTOR) {
  const chapters = await audiobookRepository.listChapters(audiobookId);
  const ids = new Set(chapters.map((c) => c.id));
  for (const item of items) if (!ids.has(item.id)) throw new NotFoundError(`Chapter ${item.id} does not belong to this audiobook.`);
  await runInTransaction((tx) => audiobookRepository.reorderChapters(tx, items));
  await recordAudit(ctx, { action: "content.chapters_reordered", entityType: "AUDIOBOOK", entityId: audiobookId });
}
