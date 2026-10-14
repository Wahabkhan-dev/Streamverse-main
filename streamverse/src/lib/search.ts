import type { ItemRef, ItemType } from "./data";
import { itemAge, itemGenres, itemLanguage, itemRating, itemTitle, itemYear, refOf, type Item } from "./items";

export interface Person {
  name: string;
  role: "Actor" | "Author" | "Narrator" | "Director";
  titles: ItemRef[];
}

export interface Filters {
  type: "All" | ItemType;
  genre: string;
  language: string;
  release: "Any" | "2026" | "2025" | "2024" | "Older";
  rating: "Any" | "4.5+" | "4+" | "3.5+";
  age: string;
}
export const NO_FILTERS: Filters = { type: "All", genre: "Any", language: "Any", release: "Any", rating: "Any", age: "Any" };
export const filtersActive = (f: Filters) => Object.entries(f).some(([k, v]) => v !== (NO_FILTERS as unknown as Record<string, string>)[k]);

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Every searchable name: actors, directors, authors and narrators, with the titles they appear in. */
export function peopleOf(items: Item[]): Person[] {
  const map = new Map<string, Person>();
  const add = (name: string | undefined, role: Person["role"], ref: ItemRef) => {
    const n = name?.trim();
    if (!n) return;
    const key = `${role}:${n.toLowerCase()}`;
    const p = map.get(key) ?? { name: n, role, titles: [] };
    if (!p.titles.some((t) => t.type === ref.type && (t.id && ref.id ? t.id === ref.id : t.slug === ref.slug))) p.titles.push(ref);
    map.set(key, p);
  };
  for (const i of items) {
    const ref = refOf(i);
    if (i.type === "Movie") {
      i.m.cast.forEach((c) => add(c.name, "Actor", ref));
      add(i.m.info?.director, "Director", ref);
    } else {
      add(i.b.author, "Author", ref);
      add(i.b.narrator, "Narrator", ref);
    }
  }
  return [...map.values()].sort((a, b) => b.titles.length - a.titles.length || a.name.localeCompare(b.name));
}

function haystack(i: Item): { primary: string; secondary: string } {
  if (i.type === "Movie") {
    return {
      primary: i.m.title,
      secondary: [i.m.genres.join(" "), i.m.cast.map((c) => c.name).join(" "), i.m.info?.director ?? "", (i.m.info?.tags ?? []).join(" "), i.m.description].join(" "),
    };
  }
  return { primary: i.b.title, secondary: [i.b.author, i.b.narrator ?? "", i.b.genre, (i.b.info?.tags ?? []).join(" "), i.b.series ?? ""].join(" ") };
}

export function matchesFilters(i: Item, f: Filters): boolean {
  if (f.type !== "All" && i.type !== f.type) return false;
  if (f.genre !== "Any" && !itemGenres(i).includes(f.genre)) return false;
  if (f.language !== "Any" && itemLanguage(i) !== f.language) return false;
  if (f.release !== "Any") {
    const y = itemYear(i);
    if (!y) return false;
    if (f.release === "Older" ? y >= 2024 : y !== Number(f.release)) return false;
  }
  if (f.rating !== "Any" && itemRating(i) < parseFloat(f.rating)) return false;
  if (f.age !== "Any" && itemAge(i) !== f.age) return false;
  return true;
}

/** Ranked title / author / cast / genre matches. An empty query returns nothing. */
export function searchItems(items: Item[], q: string, f: Filters): Item[] {
  const needle = norm(q.trim());
  if (!needle) return [];
  const terms = needle.split(/\s+/);
  return items
    .filter((i) => matchesFilters(i, f))
    .map((i) => {
      const h = haystack(i);
      const primary = norm(h.primary);
      const secondary = norm(h.secondary);
      if (!terms.every((t) => primary.includes(t) || secondary.includes(t))) return null;
      const score = (primary === needle ? 6 : 0) + (primary.startsWith(needle) ? 4 : 0) + (primary.includes(needle) ? 3 : 0) + (terms.every((t) => primary.includes(t)) ? 2 : 1);
      return { i, score };
    })
    .filter((x): x is { i: Item; score: number } => !!x)
    .sort((a, b) => b.score - a.score || itemTitle(a.i).localeCompare(itemTitle(b.i)))
    .map((x) => x.i);
}

export function searchPeople(people: Person[], q: string): Person[] {
  const needle = norm(q.trim());
  if (!needle) return [];
  return people.filter((p) => norm(p.name).includes(needle));
}

export interface Suggestions {
  titles: Item[];
  people: Person[];
  genres: string[];
}
export function suggest(items: Item[], people: Person[], genres: string[], q: string): Suggestions {
  const needle = norm(q.trim());
  if (!needle) return { titles: [], people: [], genres: [] };
  return {
    titles: searchItems(items, q, NO_FILTERS).slice(0, 5),
    people: searchPeople(people, q).slice(0, 3),
    genres: genres.filter((g) => norm(g).includes(needle)).slice(0, 3),
  };
}
