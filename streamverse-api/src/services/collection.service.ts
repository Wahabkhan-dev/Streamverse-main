import * as collectionRepository from "../repositories/collection.repository";
import * as contentRepository from "../repositories/content.repository";
import { createSlugFromTitle, normalizeSlug } from "./slug.service";
import { assertNotStale } from "../utils/concurrency";
import { ConflictError, NotFoundError } from "../utils/errors";
import { buildPagination, toSkipTake } from "../utils/pagination";
import type { AddCollectionItemInput, CreateCollectionInput, ReorderCollectionItemsInput, UpdateCollectionInput } from "../validators/collection.validator";
import type { AuditContext } from "./auditLog.service";
import { recordAudit } from "./auditLog.service";
import { toMixedCards } from "./mixedContent.service";
import { isCustomerVisible } from "./contentAccess.service";

const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

async function uniqueCollectionSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = base;
  for (let n = 2; await collectionRepository.slugExists(candidate, excludeId); n++) candidate = `${base}-${n}`;
  return candidate;
}

export async function createCollection(input: CreateCollectionInput, ctx: AuditContext = NO_ACTOR) {
  const slug = await uniqueCollectionSlug(input.manualSlug ? normalizeSlug(input.manualSlug) : createSlugFromTitle(input.name));
  const collection = await collectionRepository.create({ name: input.name, slug, description: input.description, bannerAssetId: input.bannerAssetId });
  await recordAudit(ctx, { action: "collection.created", entityType: "COLLECTION", entityId: collection.id, metadata: { name: collection.name } });
  return collection;
}

export async function updateCollection(id: string, input: UpdateCollectionInput, ctx: AuditContext = NO_ACTOR) {
  const existing = await collectionRepository.findById(id);
  if (!existing) throw new NotFoundError("Collection not found");
  assertNotStale(existing.updatedAt, input.expectedUpdatedAt);

  const data: Parameters<typeof collectionRepository.update>[1] = { name: input.name, description: input.description, bannerAssetId: input.bannerAssetId, status: input.status };
  if (input.manualSlug) data.slug = await uniqueCollectionSlug(normalizeSlug(input.manualSlug), id);
  const updated = await collectionRepository.update(id, data);
  await recordAudit(ctx, { action: "collection.updated", entityType: "COLLECTION", entityId: id, metadata: { fields: Object.keys(input).filter((k) => k !== "expectedUpdatedAt") } });
  return updated;
}

/** No `deletedAt` exists for collections (Section 25 is about Content) — "deleting" one archives it. */
export async function deleteCollection(id: string, ctx: AuditContext = NO_ACTOR) {
  if (!(await collectionRepository.findById(id))) throw new NotFoundError("Collection not found");
  const archived = await collectionRepository.archive(id);
  await recordAudit(ctx, { action: "collection.archived", entityType: "COLLECTION", entityId: id });
  return archived;
}

export const getCollection = collectionRepository.findById;

export async function listCollections(filters: { page: number; limit: number; sortBy: "name" | "createdAt" | "updatedAt"; sortOrder: "asc" | "desc"; search?: string | undefined; status?: "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED" | undefined }) {
  const { skip, take } = toSkipTake(filters.page, filters.limit);
  const { rows, total } = await collectionRepository.list(filters, skip, take, { [filters.sortBy]: filters.sortOrder });
  return { rows, pagination: buildPagination(total, filters.page, filters.limit) };
}

/* ---------------------------------------------------------------- items (Section 30/68) */

async function assertContentExistsAndActive(contentId: string) {
  const content = await contentRepository.findActiveById(contentId);
  if (!content) throw new NotFoundError("The content referenced does not exist (or was deleted).");
  return content;
}

export async function addItem(collectionId: string, input: AddCollectionItemInput, ctx: AuditContext = NO_ACTOR) {
  if (!(await collectionRepository.findById(collectionId))) throw new NotFoundError("Collection not found");
  await assertContentExistsAndActive(input.contentId);
  if (await collectionRepository.itemExists(collectionId, input.contentId)) throw new ConflictError("This title is already in the collection.");
  const item = await collectionRepository.addItem(collectionId, input.contentId, input.displayOrder);
  await recordAudit(ctx, { action: "collection.item_added", entityType: "COLLECTION", entityId: collectionId, metadata: { contentId: input.contentId } });
  return item;
}

export async function removeItem(collectionId: string, contentId: string, ctx: AuditContext = NO_ACTOR) {
  const result = await collectionRepository.removeItem(collectionId, contentId);
  if (result.count === 0) throw new NotFoundError("That title is not in this collection.");
  await recordAudit(ctx, { action: "collection.item_removed", entityType: "COLLECTION", entityId: collectionId, metadata: { contentId } });
}

export const listItems = collectionRepository.itemsFor;

export async function reorderItems(collectionId: string, items: ReorderCollectionItemsInput, ctx: AuditContext = NO_ACTOR) {
  const existing = await collectionRepository.itemsFor(collectionId);
  const known = new Set(existing.map((i) => i.contentId));
  for (const item of items) if (!known.has(item.contentId)) throw new NotFoundError(`Content ${item.contentId} is not in this collection.`);
  await collectionRepository.reorderItems(collectionId, items);
  await recordAudit(ctx, { action: "collection.items_reordered", entityType: "COLLECTION", entityId: collectionId });
}

/* ---------------------------------------------------------------- customer reads (Section 17/18) */

export async function listPublishedCollections(page: number, limit: number) {
  const { skip, take } = toSkipTake(page, limit);
  const { rows, total } = await collectionRepository.listPublished(skip, take);
  return { rows, pagination: buildPagination(total, page, limit) };
}

/**
 * Section 18: items whose content is no longer customer-visible (unpublished, archived, soft-deleted,
 * hidden) are filtered out — never returned as a broken card.
 */
export async function getPublishedCollectionBySlug(slug: string) {
  const collection = await collectionRepository.findPublishedBySlug(slug);
  if (!collection) throw new NotFoundError("Collection not found");
  const items = await collectionRepository.itemsWithContent(collection.id);
  const visible = items.map((i) => i.content).filter((c) => isCustomerVisible(c));
  const cards = await toMixedCards(visible);
  return { id: collection.id, name: collection.name, slug: collection.slug, description: collection.description, bannerAssetId: collection.bannerAssetId, items: cards };
}
