import type { ContentType } from "@prisma/client";
import * as catalogRepository from "../repositories/catalog.repository";
import { toMixedCards } from "./mixedContent.service";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 12;

interface Scoreable {
  id: string;
  genres: { genreId: string }[];
  tags: { tagId: string }[];
  languages: { languageId: string }[];
}

/** Deterministic, explainable scoring (Section 61) — no AI, no hidden signal. */
function score(target: Scoreable, candidate: Scoreable): number {
  const genreIds = new Set(candidate.genres.map((g) => g.genreId));
  const tagIds = new Set(candidate.tags.map((t) => t.tagId));
  const languageIds = new Set(candidate.languages.map((l) => l.languageId));
  const sharedGenres = target.genres.filter((g) => genreIds.has(g.genreId)).length;
  const sharedTags = target.tags.filter((t) => tagIds.has(t.tagId)).length;
  const sharedLanguages = target.languages.filter((l) => languageIds.has(l.languageId)).length;
  return sharedGenres * 3 + sharedTags * 2 + sharedLanguages;
}

const newest = (c: { publishedAt?: Date | null; createdAt?: Date | null }) => (c.publishedAt ?? c.createdAt)?.getTime() ?? 0;

/**
 * Section 61/62: same type, same-type-eligible candidates only, excludes the title itself, ranked by
 * shared genre (weighted highest) / tags / language — capped at a small limit, never a big result set.
 * When few titles share anything, the row is filled with the newest other titles of the same type, so the customer always
 * has several to choose from. A title customers can't see yet (an admin's preview) gets that newest-first row.
 */
export async function getRelatedContent(type: ContentType, contentId: string, limit = DEFAULT_LIMIT) {
  const cappedLimit = Math.min(limit, MAX_LIMIT);
  const pool = await catalogRepository.listAllVisible(type);
  const target = pool.find((c) => c.id === contentId);

  const ranked = pool
    .filter((c) => c.id !== contentId)
    .map((c) => ({ content: c, points: target ? score(target, c) : 0 }))
    .sort((a, b) => b.points - a.points || newest(b.content) - newest(a.content))
    .slice(0, cappedLimit)
    .map((c) => c.content);

  return toMixedCards(ranked);
}
