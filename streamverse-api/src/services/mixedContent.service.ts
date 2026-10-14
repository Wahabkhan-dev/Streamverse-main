import * as catalogRepository from "../repositories/catalog.repository";
import { mapMixedCard, type CustomerContentBaseRow } from "../mappers/customerContent.mapper";

/**
 * Turns a list of customer-visible `Content` rows (any mix of types, already in the right order — e.g.
 * from a collection or homepage section) into title-agnostic cards. Used by collections, homepage manual
 * sections, related content and catalog search, so none of them re-implement this join. Kept in its own
 * module (rather than catalog.service.ts) so those callers — including relatedContent.service.ts, which
 * catalog.service.ts itself calls — never form an import cycle.
 */
export async function toMixedCards(contents: (CustomerContentBaseRow & { id: string; type: string })[]) {
  const movieIds = contents.filter((c) => c.type === "MOVIE").map((c) => c.id);
  const ebookIds = contents.filter((c) => c.type === "EBOOK").map((c) => c.id);
  const audiobookIds = contents.filter((c) => c.type === "AUDIOBOOK").map((c) => c.id);
  const { movies, ebooks, audiobooks } = await catalogRepository.coverFieldsByContentId(movieIds, ebookIds, audiobookIds);
  const movieById = new Map(movies.map((m) => [m.contentId, m]));
  const ebookById = new Map(ebooks.map((b) => [b.contentId, b]));
  const audiobookById = new Map(audiobooks.map((b) => [b.contentId, b]));

  return contents.map((content) => {
    if (content.type === "MOVIE") {
      const m = movieById.get(content.id);
      return mapMixedCard(content, { coverAssetId: m?.posterAssetId ?? null, headline: m?.runtimeMinutes ? `${m.runtimeMinutes} min` : null });
    }
    if (content.type === "EBOOK") {
      const b = ebookById.get(content.id);
      return mapMixedCard(content, { coverAssetId: b?.frontCoverAssetId ?? null, headline: b?.author ?? null });
    }
    const b = audiobookById.get(content.id);
    return mapMixedCard(content, { coverAssetId: b?.coverAssetId ?? null, headline: b?.narrator ?? b?.author ?? null });
  });
}
