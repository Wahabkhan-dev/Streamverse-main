import * as catalogRepository from "../repositories/catalog.repository";
import { mapMixedCard, type CustomerContentBaseRow } from "../mappers/customerContent.mapper";
import { signAssetsById } from "./assetUrl.service";
import { analyticsCache, publicCacheWindow } from "../utils/analyticsCache";
import { HOMEPAGE_CACHE_PREFIX } from "./homepage.service";

/**
 * Turns a list of customer-visible `Content` rows (any mix of types, already in the right order — e.g.
 * from a collection or homepage section) into title-agnostic cards. Used by collections, homepage manual
 * sections, related content and catalog search, so none of them re-implement this join. Kept in its own
 * module (rather than catalog.service.ts) so those callers — including relatedContent.service.ts, which
 * catalog.service.ts itself calls — never form an import cycle.
 */
type CardRow = Awaited<ReturnType<typeof catalogRepository.contentForCards>>[number];
export interface CachedCard {
  /** kept so visibility is re-checked on every use (a title can go live or be taken down by schedule) */
  content: CardRow;
  card: Awaited<ReturnType<typeof toMixedCards>>[number];
}

/**
 * Public card metadata per title (title, genres, cover...), the same for every viewer — so a personal list (Continue Watching)
 * reuses cached cards instead of re-reading every title's relations each time. Cards for titles not in memory are built in ONE
 * batch. Only public fields: nothing about the viewer is in here, and the caller still checks visibility per request.
 */
export async function cachedCardsByContentId(contentIds: string[]): Promise<Map<string, CachedCard>> {
  const key = (id: string) => `${HOMEPAGE_CACHE_PREFIX}card:${id}`;
  const { ttl, stale } = publicCacheWindow();
  const byKey = await analyticsCache.getOrSetMany<CachedCard>(
    contentIds.map(key),
    async (missingKeys) => {
      const rows = await catalogRepository.contentForCards(missingKeys.map((k) => k.slice(key("").length)));
      const cards = await toMixedCards(rows);
      return new Map(rows.map((content, i) => [key(content.id), { content, card: cards[i]! }]));
    },
    ttl,
    stale,
  );
  return new Map(contentIds.flatMap((id) => (byKey.has(key(id)) ? [[id, byKey.get(key(id))!] as const] : [])));
}

export async function toMixedCards(contents: (CustomerContentBaseRow & { id: string; type: string })[]) {
  const movieIds = contents.filter((c) => c.type === "MOVIE").map((c) => c.id);
  const ebookIds = contents.filter((c) => c.type === "EBOOK").map((c) => c.id);
  const audiobookIds = contents.filter((c) => c.type === "AUDIOBOOK").map((c) => c.id);
  const { movies, ebooks, audiobooks } = await catalogRepository.coverFieldsByContentId(movieIds, ebookIds, audiobookIds);
  const movieById = new Map(movies.map((m) => [m.contentId, m]));
  const ebookById = new Map(ebooks.map((b) => [b.contentId, b]));
  const audiobookById = new Map(audiobooks.map((b) => [b.contentId, b]));

  const withCover = contents.map((content) => {
    if (content.type === "MOVIE") {
      const m = movieById.get(content.id);
      return { content, coverAssetId: m?.posterAssetId ?? null, headline: m?.runtimeMinutes ? `${m.runtimeMinutes} min` : null };
    }
    if (content.type === "EBOOK") {
      const b = ebookById.get(content.id);
      return { content, coverAssetId: b?.frontCoverAssetId ?? null, headline: b?.author ?? null };
    }
    const b = audiobookById.get(content.id);
    return { content, coverAssetId: b?.coverAssetId ?? null, headline: b?.narrator ?? b?.author ?? null };
  });

  // every card on every surface gets the same canonical, signed image — signed in ONE batch for the whole list
  const urls = await signAssetsById(withCover.map((c) => c.coverAssetId));
  return withCover.map(({ content, coverAssetId, headline }) => ({
    ...mapMixedCard(content, { coverAssetId, headline }),
    image: (coverAssetId && urls.get(coverAssetId)) || null,
  }));
}
