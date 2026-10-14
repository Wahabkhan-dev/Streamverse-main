import * as catalogRepository from "../repositories/catalog.repository";
import * as contentRepository from "../repositories/content.repository";
import * as homepageRepository from "../repositories/homepage.repository";
import { assertNotStale } from "../utils/concurrency";
import { ConflictError, NotFoundError } from "../utils/errors";
import type { AddHomepageItemInput, CreateHomepageSectionInput, ReorderHomepageItemsInput, UpdateHomepageSectionInput } from "../validators/homepage.validator";
import type { ReorderInput } from "../validators/content.validator";
import type { AuditContext } from "./auditLog.service";
import { recordAudit } from "./auditLog.service";
import { toMixedCards } from "./mixedContent.service";
import { isCustomerVisible } from "./contentAccess.service";

const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

export async function createSection(input: CreateHomepageSectionInput, ctx: AuditContext = NO_ACTOR) {
  if (await homepageRepository.findSectionByKey(input.key)) throw new ConflictError(`A homepage section with key "${input.key}" already exists.`);
  const section = await homepageRepository.createSection(input);
  await recordAudit(ctx, { action: "homepage.section_created", entityType: "HOMEPAGE_SECTION", entityId: section.id, metadata: { key: section.key } });
  return section;
}

/**
 * Section 32/39: `key` can never be sent here (it is omitted from UpdateHomepageSectionInput entirely) —
 * renaming `displayTitle` never touches it, so nothing that references the section by key can break.
 */
export async function updateSection(id: string, input: UpdateHomepageSectionInput, ctx: AuditContext = NO_ACTOR) {
  const existing = await homepageRepository.findSectionById(id);
  if (!existing) throw new NotFoundError("Homepage section not found");
  assertNotStale(existing.updatedAt, input.expectedUpdatedAt);
  const { expectedUpdatedAt: _drop, ...data } = input;
  void _drop;
  const updated = await homepageRepository.updateSection(id, data);
  await recordAudit(ctx, { action: "homepage.section_updated", entityType: "HOMEPAGE_SECTION", entityId: id, metadata: { fields: Object.keys(data) } });
  return updated;
}

export async function deleteSection(id: string, ctx: AuditContext = NO_ACTOR) {
  if (!(await homepageRepository.findSectionById(id))) throw new NotFoundError("Homepage section not found");
  await homepageRepository.deleteSection(id);
  await recordAudit(ctx, { action: "homepage.section_deleted", entityType: "HOMEPAGE_SECTION", entityId: id });
}

export const listSections = homepageRepository.listSections;
export const getSection = homepageRepository.findSectionById;

export async function reorderSections(items: ReorderInput, ctx: AuditContext = NO_ACTOR) {
  const all = await homepageRepository.listSections();
  const known = new Set(all.map((s) => s.id));
  for (const item of items) if (!known.has(item.id)) throw new NotFoundError(`Homepage section ${item.id} does not exist.`);
  await homepageRepository.reorderSections(items);
  await recordAudit(ctx, { action: "homepage.sections_reordered", entityType: "HOMEPAGE_SECTION" });
}

/* ---------------------------------------------------------------- items (Section 34/69) */

export async function addItem(sectionId: string, input: AddHomepageItemInput, ctx: AuditContext = NO_ACTOR) {
  if (!(await homepageRepository.findSectionById(sectionId))) throw new NotFoundError("Homepage section not found");
  if (!(await contentRepository.findActiveById(input.contentId))) throw new NotFoundError("The content referenced does not exist (or was deleted).");
  if (await homepageRepository.itemExists(sectionId, input.contentId)) throw new ConflictError("This title is already in the section.");
  const item = await homepageRepository.addItem(sectionId, input.contentId, input.displayOrder);
  await recordAudit(ctx, { action: "homepage.item_added", entityType: "HOMEPAGE_SECTION", entityId: sectionId, metadata: { contentId: input.contentId } });
  return item;
}

export async function removeItem(sectionId: string, contentId: string, ctx: AuditContext = NO_ACTOR) {
  const result = await homepageRepository.removeItem(sectionId, contentId);
  if (result.count === 0) throw new NotFoundError("That title is not in this section.");
  await recordAudit(ctx, { action: "homepage.item_removed", entityType: "HOMEPAGE_SECTION", entityId: sectionId, metadata: { contentId } });
}

export const listItems = homepageRepository.itemsFor;

export async function reorderItems(sectionId: string, items: ReorderHomepageItemsInput, ctx: AuditContext = NO_ACTOR) {
  const existing = await homepageRepository.itemsFor(sectionId);
  const known = new Set(existing.map((i) => i.contentId));
  for (const item of items) if (!known.has(item.contentId)) throw new NotFoundError(`Content ${item.contentId} is not in this section.`);
  await homepageRepository.reorderItems(sectionId, items);
  await recordAudit(ctx, { action: "homepage.items_reordered", entityType: "HOMEPAGE_SECTION", entityId: sectionId });
}

/* ---------------------------------------------------------------- customer read (Section 12-14) */

/**
 * Every ENABLED section, in display order, each resolved to customer-visible items only (Section 13/14).
 * MANUAL sections read their HomepageSectionItem rows; DYNAMIC ones (TRENDING/POPULAR/FEATURED/
 * NEW_RELEASE/LATEST) derive straight from Content flags/dates — nothing is duplicated between the two.
 */
export async function getCustomerHomepage() {
  const sections = await homepageRepository.listSections();
  const enabled = sections.filter((s) => s.enabled);

  return Promise.all(
    enabled.map(async (section) => {
      let items: Awaited<ReturnType<typeof toMixedCards>>;
      if (section.type === "MANUAL") {
        const rows = await homepageRepository.itemsWithContent(section.id);
        const visible = rows.map((r) => r.content).filter((c) => isCustomerVisible(c));
        items = await toMixedCards(visible.slice(0, section.itemLimit));
      } else {
        const contents = await catalogRepository.listDynamic(section.type as "FEATURED" | "TRENDING" | "POPULAR" | "NEW_RELEASE" | "LATEST", section.itemLimit);
        items = await toMixedCards(contents);
      }
      return { key: section.key, displayTitle: section.displayTitle, type: section.type, items };
    }),
  );
}
