import type { ContentType } from "@prisma/client";
import * as genreRepository from "../repositories/genre.repository";
import * as languageRepository from "../repositories/language.repository";
import * as searchRepository from "../repositories/search.repository";
import { buildPagination, toSkipTake } from "../utils/pagination";
import { toMixedCards } from "./mixedContent.service";
import type { SearchQuery } from "../validators/search.validator";

const TYPE_MAP: Record<string, ContentType | undefined> = { ALL: undefined, MOVIES: "MOVIE", EBOOKS: "EBOOK", AUDIOBOOKS: "AUDIOBOOK" };

async function resolveFilters(query: SearchQuery) {
  const [genre, language] = await Promise.all([query.genre ? genreRepository.findBySlug(query.genre) : null, query.language ? languageRepository.findByCode(query.language) : null]);
  return { genreId: genre?.id, languageId: language?.id, ageRating: query.ageRating };
}

function groupPeople(matches: searchRepository.PersonMatch[]) {
  const byKey = new Map<string, { name: string; role: string; titles: { id: string; slug: string; title: string; type: ContentType }[] }>();
  for (const m of matches) {
    const key = `${m.role}:${m.name.toLowerCase()}`;
    const entry = byKey.get(key) ?? { name: m.name, role: m.role, titles: [] };
    if (!entry.titles.some((t) => t.id === m.content.id)) entry.titles.push(m.content);
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => b.titles.length - a.titles.length || a.name.localeCompare(b.name));
}

/** Section 20/21: the one search endpoint — content types + people, over the same customer-visible data every other read uses. */
export async function search(query: SearchQuery) {
  const { skip, take } = toSkipTake(query.page, query.limit);

  if (query.type === "PEOPLE") {
    const matches = await searchRepository.searchPeople(query.q, 100);
    const people = groupPeople(matches);
    const pageOfPeople = people.slice(skip, skip + take);
    return { rows: pageOfPeople, pagination: buildPagination(people.length, query.page, query.limit) };
  }

  const filters = await resolveFilters(query);
  if ((query.genre && !filters.genreId) || (query.language && !filters.languageId)) {
    return { rows: [], pagination: buildPagination(0, query.page, query.limit) };
  }
  const { rows, total } = await searchRepository.searchContent(TYPE_MAP[query.type], query.q, filters, skip, take);
  const cards = await toMixedCards(rows);
  return { rows: cards, pagination: buildPagination(total, query.page, query.limit) };
}

const SUGGESTION_LIMIT = 8;

/** Section 22: a small, lightweight result set — titles and people names, nothing structured like a full card. */
export async function suggest(q: string) {
  const [content, people] = await Promise.all([searchRepository.searchContent(undefined, q, {}, 0, SUGGESTION_LIMIT), searchRepository.searchPeople(q, SUGGESTION_LIMIT)]);
  const titleSuggestions = content.rows.map((c) => ({ kind: "title" as const, label: c.title, type: c.type, slug: c.slug }));
  const peopleNames = [...new Set(people.map((p) => p.name))].slice(0, SUGGESTION_LIMIT);
  const peopleSuggestions = peopleNames.map((name) => ({ kind: "person" as const, label: name }));
  return [...titleSuggestions, ...peopleSuggestions].slice(0, SUGGESTION_LIMIT);
}
