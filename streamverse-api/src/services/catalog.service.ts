import type { Prisma } from "@prisma/client";
import * as catalogRepository from "../repositories/catalog.repository";
import * as mediaAssetRepository from "../repositories/mediaAsset.repository";
import * as genreRepository from "../repositories/genre.repository";
import * as languageRepository from "../repositories/language.repository";
import { NotFoundError } from "../utils/errors";
import { buildPagination, toSkipTake } from "../utils/pagination";
import { evaluateAccess, isCustomerVisible, loadAccessUser, type AccessUser } from "./contentAccess.service";
import type { CatalogListQuery } from "../validators/catalog.validator";
import { toMovieCard, toMovieDetail } from "../mappers/movieCustomer.mapper";
import { toEbookCard, toEbookDetail } from "../mappers/ebookCustomer.mapper";
import { toAudiobookCard, toAudiobookDetail } from "../mappers/audiobookCustomer.mapper";
import { getRelatedContent } from "./relatedContent.service";
import { signAssetsById, signStorageKey as signCoverUrl } from "./assetUrl.service";
import { analyticsCache, publicCacheWindow } from "../utils/analyticsCache";
import { HOMEPAGE_CACHE_PREFIX } from "./homepage.service";

/** "genre"/"language" query params are a slug/code (what the frontend has); resolve to the real ids. */
async function resolveFilters(query: CatalogListQuery) {
  const [genre, language] = await Promise.all([query.genre ? genreRepository.findBySlug(query.genre) : null, query.language ? languageRepository.findByCode(query.language) : null]);
  return {
    search: query.search,
    ageRating: query.ageRating,
    featured: query.featured,
    trending: query.trending,
    popular: query.popular,
    newRelease: query.newRelease,
    genreId: genre?.id,
    languageId: language?.id,
  };
}

function buildWhere(query: CatalogListQuery, filters: Awaited<ReturnType<typeof resolveFilters>>): Prisma.ContentWhereInput {
  // an unresolvable genre/language slug means "no such filter value" — the result set is empty, not unfiltered
  if ((query.genre && !filters.genreId) || (query.language && !filters.languageId)) return { id: "no-such-content-matches-this-filter" };
  return catalogRepository.withCustomerFilters(catalogRepository.customerVisibleWhere(), filters);
}

/** Public and identical for every visitor, so cached briefly; any admin write drops it (see admin.routes.ts). */
export function listMovies(query: CatalogListQuery) {
  const { ttl, stale } = publicCacheWindow();
  return analyticsCache.getOrSet(`${HOMEPAGE_CACHE_PREFIX}catalog:movies:${JSON.stringify(query)}`, () => computeMovies(query), ttl, stale);
}

async function computeMovies(query: CatalogListQuery) {
  const filters = await resolveFilters(query);
  const where = buildWhere(query, filters);
  const { skip, take } = toSkipTake(query.page, query.limit);
  const { rows, total } = await catalogRepository.listMovies(where, skip, take, { [query.sortBy]: query.sortOrder });
  const cards = await Promise.all(
    rows.map(async (row) => {
      const posterUrl = await signCoverUrl(row.posterAsset?.storageKey);
      return toMovieCard(row, posterUrl);
    }),
  );
  return { rows: cards, pagination: buildPagination(total, query.page, query.limit) };
}

/** Public and identical for every visitor, so cached briefly; any admin write drops it (see admin.routes.ts). */
export function listEbooks(query: CatalogListQuery) {
  const { ttl, stale } = publicCacheWindow();
  return analyticsCache.getOrSet(`${HOMEPAGE_CACHE_PREFIX}catalog:ebooks:${JSON.stringify(query)}`, () => computeEbooks(query), ttl, stale);
}

async function computeEbooks(query: CatalogListQuery) {
  const filters = await resolveFilters(query);
  const where = buildWhere(query, filters);
  const { skip, take } = toSkipTake(query.page, query.limit);
  const { rows, total } = await catalogRepository.listEbooks(where, skip, take, { [query.sortBy]: query.sortOrder });
  const cards = await Promise.all(
    rows.map(async (row) => {
      const coverUrl = await signCoverUrl(row.frontCoverAsset?.storageKey);
      return toEbookCard(row, coverUrl);
    }),
  );
  return { rows: cards, pagination: buildPagination(total, query.page, query.limit) };
}

/** Public and identical for every visitor, so cached briefly; any admin write drops it (see admin.routes.ts). */
export function listAudiobooks(query: CatalogListQuery) {
  const { ttl, stale } = publicCacheWindow();
  return analyticsCache.getOrSet(`${HOMEPAGE_CACHE_PREFIX}catalog:audiobooks:${JSON.stringify(query)}`, () => computeAudiobooks(query), ttl, stale);
}

async function computeAudiobooks(query: CatalogListQuery) {
  const filters = await resolveFilters(query);
  const where = buildWhere(query, filters);
  const { skip, take } = toSkipTake(query.page, query.limit);
  const { rows, total } = await catalogRepository.listAudiobooks(where, skip, take, { [query.sortBy]: query.sortOrder });
  const cards = await Promise.all(
    rows.map(async (row) => {
      const coverUrl = await signCoverUrl(row.coverAsset?.storageKey);
      return toAudiobookCard(row, coverUrl);
    }),
  );
  return { rows: cards, pagination: buildPagination(total, query.page, query.limit) };
}

/**
 * Batched signed cover/poster URL per content id — one query per related table (never one per row),
 * reused by every admin content-list endpoint so Dashboard/Movies/eBooks/Audiobooks tables all resolve
 * the same canonical asset the same way.
 */
export async function signCoversByContentId(contentIds: string[], type: "MOVIE" | "EBOOK" | "AUDIOBOOK"): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (!contentIds.length) return result;

  const { movies, ebooks, audiobooks } = await catalogRepository.coverFieldsByContentId(
    type === "MOVIE" ? contentIds : [],
    type === "EBOOK" ? contentIds : [],
    type === "AUDIOBOOK" ? contentIds : [],
  );

  const assetIdByContentId = new Map<string, string | null>();
  if (type === "MOVIE") for (const r of movies) assetIdByContentId.set(r.contentId, r.posterAssetId);
  if (type === "EBOOK") for (const r of ebooks) assetIdByContentId.set(r.contentId, r.frontCoverAssetId);
  if (type === "AUDIOBOOK") for (const r of audiobooks) assetIdByContentId.set(r.contentId, r.coverAssetId);

  const assetIds = [...new Set([...assetIdByContentId.values()].filter((id): id is string => !!id))];
  const assets = assetIds.length ? await mediaAssetRepository.findManyByIds(assetIds) : [];
  const storageKeyByAssetId = new Map(assets.map((a) => [a.id, a.storageKey]));

  const urlByAssetId = new Map<string, string | null>();
  await Promise.all(assetIds.map(async (id) => urlByAssetId.set(id, await signCoverUrl(storageKeyByAssetId.get(id)))));

  for (const [contentId, assetId] of assetIdByContentId) result.set(contentId, assetId ? urlByAssetId.get(assetId) ?? null : null);
  return result;
}

/**
 * Detail routes (Section 67): an unknown slug is 404. A slug that names real but currently
 * not-customer-visible content (DRAFT/UNPUBLISHED/ARCHIVED/soft-deleted/HIDDEN) is ALSO 404 — from the
 * outside, "exists but admin took it down" and "never existed" look the same, and that is deliberate
 * (it does not confirm a slug ever existed to someone who shouldn't see it). A title a customer CAN see
 * but can't fully consume yet (subscription/age/region/schedule) is 200, with `access.canConsume: false`
 * and a reason — that is Section 55's whole point, so it is not folded into the 404 case.
 *
 * `adminPreview`: an admin's Preview button opens the customer page of a title that is not live yet (draft, scheduled,
 * unpublished, archived). Only a deleted title stays 404 for them, and a title customers can't see is marked with
 * `previewStatus` so the page can say so.
 */
type Visible = Parameters<typeof isCustomerVisible>[0] & { status: string };
const visible = (content: Visible, adminPreview: boolean) => (adminPreview ? !content.deletedAt : isCustomerVisible(content));
const previewOf = (content: Visible) => (isCustomerVisible(content) ? {} : { previewStatus: content.status });

export async function getMovieBySlug(slug: string, userId: string | undefined, adminPreview = false) {
  const row = await catalogRepository.findMovieBySlug(slug);
  if (!row || !visible(row.content, adminPreview)) throw new NotFoundError("Movie not found");
  const access = await accessFor(row.content, userId);
  const related = await getRelatedContent("MOVIE", row.content.id);
  const urls = await signAssetsById([row.posterAssetId, row.backdropAssetId, row.thumbnailAssetId]);
  const image = (row.posterAssetId && urls.get(row.posterAssetId)) || null;
  const backdropImage = (row.backdropAssetId && urls.get(row.backdropAssetId)) || null;
  return { ...toMovieDetail(row, access), image, backdropImage, related, ...previewOf(row.content) };
}

export async function getEbookBySlug(slug: string, userId: string | undefined, adminPreview = false) {
  const row = await catalogRepository.findEbookBySlug(slug);
  if (!row || !visible(row.content, adminPreview)) throw new NotFoundError("eBook not found");
  const access = await accessFor(row.content, userId);
  const related = await getRelatedContent("EBOOK", row.content.id);
  const urls = await signAssetsById([row.frontCoverAssetId]);
  const image = (row.frontCoverAssetId && urls.get(row.frontCoverAssetId)) || null;
  return { ...toEbookDetail(row, access), image, related, ...previewOf(row.content) };
}

export async function getAudiobookBySlug(slug: string, userId: string | undefined, adminPreview = false) {
  const row = await catalogRepository.findAudiobookBySlug(slug);
  if (!row || !visible(row.content, adminPreview)) throw new NotFoundError("Audiobook not found");
  const access = await accessFor(row.content, userId);
  const related = await getRelatedContent("AUDIOBOOK", row.content.id);
  const urls = await signAssetsById([row.coverAssetId]);
  const image = (row.coverAssetId && urls.get(row.coverAssetId)) || null;
  return { ...toAudiobookDetail(row, access), image, related, ...previewOf(row.content) };
}

export async function accessFor(content: Parameters<typeof evaluateAccess>[0] & { territories?: { countryCode: string }[] }, userId: string | undefined) {
  const user: AccessUser | undefined = await loadAccessUser(userId);
  const countryCodes = content.territories?.map((t) => t.countryCode) ?? [];
  return evaluateAccess(content, user, countryCodes);
}

export { signAssetsById };
