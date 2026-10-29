import type { Content } from "@prisma/client";
import * as contentRepository from "../repositories/content.repository";
import * as homepageRepository from "../repositories/homepage.repository";
import * as catalogRepository from "../repositories/catalog.repository";
import * as bannerRepository from "../repositories/banner.repository";
import * as collectionRepository from "../repositories/collection.repository";
import { toMixedCards } from "./mixedContent.service";
import { signAssetsById } from "./assetUrl.service";
import { env } from "../config/env";
import { analyticsCache, publicCacheWindow } from "../utils/analyticsCache";
import { assertNotStale } from "../utils/concurrency";
import { ConflictError, NotFoundError } from "../utils/errors";
import { DYNAMIC_SECTION_QUERIES, type AddHomepageItemInput, type CreateHomepageSectionInput, type ReorderHomepageItemsInput, type UpdateHomepageSectionInput } from "../validators/homepage.validator";
import type { ReorderInput } from "../validators/content.validator";
import type { AuditContext } from "./auditLog.service";
import { recordAudit } from "./auditLog.service";
import { isCustomerVisible } from "./contentAccess.service";

type DynamicSectionType = (typeof DYNAMIC_SECTION_QUERIES)[number];
const isDynamicSectionType = (type: string): type is DynamicSectionType => (DYNAMIC_SECTION_QUERIES as readonly string[]).includes(type);

const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

export async function createSection(input: CreateHomepageSectionInput, ctx: AuditContext = NO_ACTOR) {
  if (await homepageRepository.findSectionByKey(input.key)) throw new ConflictError(`A homepage section with key "${input.key}" already exists.`);
  await assertSourcesExist(input);
  const section = await homepageRepository.createSection(input);
  await recordAudit(ctx, { action: "homepage.section_created", entityType: "HOMEPAGE_SECTION", entityId: section.id, metadata: { key: section.key } });
  return section;
}

/**
 * Section 32/39: `key` can never be sent here (it is omitted from UpdateHomepageSectionInput entirely) —
 * renaming `displayTitle` never touches it, so nothing that references the section by key can break.
 */
/** A banner/collection section must point at something that exists (the Banner library / Collections are managed elsewhere). */
async function assertSourcesExist(input: { bannerId?: string | null | undefined; collectionId?: string | null | undefined }) {
  if (input.bannerId && !(await bannerRepository.findById(input.bannerId))) throw new NotFoundError("That banner does not exist.");
  if (input.collectionId && !(await collectionRepository.findById(input.collectionId))) throw new NotFoundError("That collection does not exist.");
}

export async function updateSection(id: string, input: UpdateHomepageSectionInput, ctx: AuditContext = NO_ACTOR) {
  const existing = await homepageRepository.findSectionById(id);
  if (!existing) throw new NotFoundError("Homepage section not found");
  assertNotStale(existing.updatedAt, input.expectedUpdatedAt);
  await assertSourcesExist(input);
  const { expectedUpdatedAt: _drop, ...rest } = input;
  void _drop;
  // Switching to MANUAL drops any stale contentType from its prior life as a dynamic section — MANUAL
  // items mix types by the admin's own picks, so a lingering contentType would be meaningless.
  const data = ["MANUAL", "HERO", "BANNER", "COLLECTION"].includes(rest.type ?? "") ? { ...rest, contentType: null } : rest;
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
 * Canonical contract (Section 12-14): the backend resolves EVERY section's items — manual curation in
 * displayOrder, and the five dynamic queries (TRENDING/POPULAR/NEW_RELEASE/FEATURED/LATEST) via the same
 * `customerVisibleWhere` catalog query the /movies, /ebooks, /audiobooks list endpoints use — so a
 * homepage consumer (the frontend, Admin preview, a test) gets one complete payload and never needs to
 * separately re-derive "which titles are featured" from the full catalog. Personalization (Continue
 * Watching/Reading/Listening) is NOT a HomepageSection at all in this schema — `type` is only "MANUAL" or
 * one of DYNAMIC_SECTION_QUERIES; continue-watching stays its own authenticated endpoint (GET /me/continue),
 * resolved per-user, which is correct and must not be folded into this public, unauthenticated payload.
 */
export const HOMEPAGE_CACHE_PREFIX = "homepage:";

/** Public and identical for every visitor, so safe to cache briefly; admin mutations invalidate it (see admin.routes.ts). */
type SectionKind = "hero" | "continue" | "collections" | "banner" | "collection" | "content";

/** What the page renders a section as. Decided here, once, so the frontend never guesses from a key. */
function kindOf(section: { key: string; type: string }): SectionKind {
  if (section.type === "BANNER") return "banner";
  if (section.type === "COLLECTION") return "collection";
  if (section.type === "HERO" || section.key === "hero") return "hero";
  if (section.key === "continue") return "continue";
  if (section.key === "collections") return "collections";
  return "content";
}

/**
 * The public homepage, optionally one slice of it (`offset`/`limit` over the enabled sections in displayOrder), so the first
 * screenful can be requested on its own and the rest later. Each slice is cached separately and resolves ONLY its own
 * sections; any admin write drops every slice (see admin.routes.ts).
 */
export function getCustomerHomepage(offset = 0, limit = 100) {
  const { ttl, stale } = publicCacheWindow();
  return analyticsCache.getOrSet(`${HOMEPAGE_CACHE_PREFIX}public:${offset}:${limit}`, () => computeCustomerHomepage(offset, limit), ttl, stale);
}

type HomepageSectionRow = Awaited<ReturnType<typeof homepageRepository.listSections>>[number];

/**
 * Banners that chose to appear on the homepage (Banner -> "Show on homepage" + where) are woven into the section list at the
 * position the banner itself names: above everything ("top"), after the section whose key it names, or at the bottom.
 * A banner already placed by a Banner section is not shown twice, and one outside its schedule (or whose linked title is
 * hidden) is left out entirely, so the page count stays honest.
 */
async function withBannersThatPlaceThemselves(sections: HomepageSectionRow[]) {
  const banners = new Map<string, NonNullable<Awaited<ReturnType<typeof resolveBanner>>>>();
  const own = await bannerRepository.listHomepageBanners();
  const placedBySection = new Set(sections.map((s) => s.bannerId).filter(Boolean));
  const virtual: Array<{ section: HomepageSectionRow; after: string | null }> = [];
  for (const b of own) {
    if (placedBySection.has(b.id)) continue;
    const resolved = await resolveBanner(b.id);
    if (!resolved) continue;
    const id = `banner:${b.id}`;
    banners.set(id, resolved);
    virtual.push({
      after: b.homepageAfter,
      section: {
        id,
        key: `banner_${b.id}`,
        displayTitle: resolved.title,
        type: "BANNER",
        contentType: null,
        enabled: true,
        displayOrder: 0,
        itemLimit: 1,
        bannerId: b.id,
        collectionId: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      } as unknown as HomepageSectionRow,
    });
  }
  if (!virtual.length) return { entries: sections, banners };
  const keys = new Set(sections.map((s) => s.key));
  const after = (key: string) => virtual.filter((v) => v.after === key).map((v) => v.section);
  const entries: HomepageSectionRow[] = [
    ...virtual.filter((v) => v.after === "top").map((v) => v.section),
    ...sections.flatMap((s) => [s, ...after(s.key)]),
    // no (or an unknown / switched-off) section named: the bottom
    ...virtual.filter((v) => !v.after || (v.after !== "top" && !keys.has(v.after))).map((v) => v.section),
  ];
  return { entries, banners };
}

async function computeCustomerHomepage(offset: number, limit: number) {
  const realSections = (await homepageRepository.listSections()).filter((s) => s.enabled);
  const { entries: enabled, banners: ownBanners } = await withBannersThatPlaceThemselves(realSections);
  const slice = enabled.slice(offset, offset + limit);

  const resolved = await Promise.all(
    slice.map(async (section) => {
      const kind = kindOf(section);
      if (kind === "banner") return { section, kind, rows: [] as Content[], banner: ownBanners.get(section.id) ?? (await resolveBanner(section.bannerId)) };
      if (kind === "collection") return { section, kind, ...(await resolveCollection(section.collectionId, section.itemLimit)) };
      if (kind === "collections") return { section, kind, rows: [] as Content[], collections: await resolveAllCollections(section.itemLimit) };
      if (kind === "continue") return { section, kind, rows: [] as Content[] };
      if (section.type === "MANUAL" || kind === "hero") {
        const rows = await homepageRepository.itemsWithContent(section.id);
        const visible = rows.filter((r) => isCustomerVisible(r.content)).slice(0, section.itemLimit).map((r) => r.content);
        // a hero with nothing hand-picked falls back to the featured movies (the Homepage settings still own it)
        if (kind === "hero" && visible.length === 0) return { section, kind, rows: await catalogRepository.listDynamic("FEATURED", section.itemLimit, "MOVIE") };
        return { section, kind, rows: visible };
      }
      if (isDynamicSectionType(section.type)) return { section, kind, rows: await catalogRepository.listDynamic(section.type, section.itemLimit, section.contentType ?? undefined) };
      return { section, kind, rows: [] as Content[] };
    }),
  );

  // ONE card-building pass for the whole slice (covers are signed in batches per type, never per section or per card)
  const everyRow = resolved.flatMap((r) => r.rows);
  const cards = await toMixedCards(everyRow as never);
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const sections = resolved.map((r) => {
    const items = r.rows.map((content, idx) => {
      const card = cardById.get(content.id);
      const ct = content.type.toLowerCase() as "movie" | "ebook" | "audiobook";
      const base = { id: content.id, slug: content.slug, title: content.title, image: card?.image ?? null };
      return {
        ...card,
        // legacy keys kept for existing consumers
        contentId: content.id,
        contentType: ct,
        position: idx,
        slug: content.slug,
        title: content.title,
        image: card?.image ?? null,
        ...(ct === "movie" ? { movie: base } : {}),
        ...(ct === "ebook" ? { ebook: { ...base, type: "ebook" as const } } : {}),
        ...(ct === "audiobook" ? { audiobook: { ...base, type: "audiobook" as const } } : {}),
      };
    });
    return {
      id: r.section.id,
      key: r.section.key,
      displayTitle: r.section.displayTitle,
      type: r.section.type,
      kind: r.kind,
      contentType: r.section.contentType,
      enabled: r.section.enabled,
      displayOrder: r.section.displayOrder,
      itemLimit: r.section.itemLimit,
      items,
      ...("banner" in r ? { banner: r.banner } : {}),
      ...("collection" in r ? { collection: r.collection } : {}),
      ...("collections" in r ? { collections: r.collections } : {}),
      updatedAt: r.section.updatedAt.toISOString(),
    };
  });
  return { sections, total: enabled.length };
}

/** One banner from the library, only while it is active and inside its schedule window and its linked title is visible. */
async function resolveBanner(bannerId: string | null) {
  if (!bannerId) return null;
  const b = await bannerRepository.findById(bannerId);
  const now = new Date();
  if (!b || !b.active || (b.startsAt && b.startsAt > now) || (b.endsAt && b.endsAt < now)) return null;
  if (b.linkedContentId && !(b.linkedContent && isCustomerVisible(b.linkedContent))) return null;
  const urls = await signAssetsById([b.desktopAssetId, b.mobileAssetId]);
  return {
    id: b.id,
    type: b.type,
    title: b.title,
    description: b.description,
    buttonText: b.buttonText,
    image: b.desktopAssetId ? (urls.get(b.desktopAssetId) ?? null) : null,
    mobileImage: b.mobileAssetId ? (urls.get(b.mobileAssetId) ?? null) : null,
    linkToSubscription: b.linkToSubscription,
    linkedContent: b.linkedContent ? { id: b.linkedContent.id, type: b.linkedContent.type, slug: b.linkedContent.slug, title: b.linkedContent.title } : null,
  };
}

async function resolveCollection(collectionId: string | null, limit: number) {
  if (!collectionId) return { rows: [] as Content[], collection: null };
  const c = await collectionRepository.findById(collectionId);
  if (!c || c.status !== "PUBLISHED") return { rows: [] as Content[], collection: null };
  const items = await collectionRepository.itemsWithContent(c.id);
  const rows = items.map((i) => i.content).filter((x) => isCustomerVisible(x)).slice(0, limit);
  const urls = await signAssetsById([c.bannerAssetId]);
  return { rows, collection: { id: c.id, slug: c.slug, name: c.name, image: c.bannerAssetId ? (urls.get(c.bannerAssetId) ?? null) : null } };
}

async function resolveAllCollections(limit: number) {
  const { rows } = await collectionRepository.listPublished(0, limit);
  const urls = await signAssetsById(rows.map((c) => c.bannerAssetId));
  return rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, image: c.bannerAssetId ? (urls.get(c.bannerAssetId) ?? null) : null }));
}
