import { isListed, itemEntity, itemGenres, itemLanguage, type Item } from "./items";

const lower = (xs: (string | undefined)[]) => xs.filter((x): x is string => !!x).map((x) => x.trim().toLowerCase());
const tagsOf = (i: Item) => lower((i.type === "Movie" ? i.m.info?.tags : i.b.info?.tags) ?? []);
const creatorsOf = (i: Item) => (i.type === "Movie" ? lower([i.m.info?.director]) : lower([i.b.author, i.b.narrator]));

/** How alike two titles are: shared genres weigh most, then tags, then the same creator, then language. */
export function similarity(a: Item, b: Item): number {
  const share = (x: string[], y: string[]) => x.filter((v) => y.includes(v)).length;
  return (
    share(lower(itemGenres(a)), lower(itemGenres(b))) * 3 +
    share(tagsOf(a), tagsOf(b)) * 2 +
    share(creatorsOf(a), creatorsOf(b)) * 2 +
    (itemLanguage(a) === itemLanguage(b) ? 1 : 0)
  );
}

const popularity = (i: Item) => (i.type === "Movie" ? i.m.views : i.b.count);
const same = (a: Item, b: Item) => {
  const x = itemEntity(a).cid;
  const y = itemEntity(b).cid;
  return x && y ? x === y : a.type === b.type && a.slug === b.slug;
};

/**
 * Titles related to `of`, derived from the catalog (never typed in): same type, customer-visible, never
 * the title itself, best match first. Titles with no genre / tag / creator / language in common are left out.
 */
export function relatedTo(of: Item, all: Item[], limit = 12): Item[] {
  return all
    .filter((i) => i.type === of.type && !same(i, of) && isListed(itemEntity(i)))
    .map((i) => ({ i, score: similarity(of, i) }))
    .filter((x) => x.score > 1)
    .sort((a, b) => b.score - a.score || popularity(b.i) - popularity(a.i))
    .slice(0, limit)
    .map((x) => x.i);
}

/** "Recommended for you": titles similar to what the customer has saved or watched, not already in those lists. */
export function recommendFor(seen: Item[], all: Item[], limit = 12): Item[] {
  if (!seen.length) return [];
  return all
    .filter((i) => isListed(itemEntity(i)) && !seen.some((s) => same(s, i)))
    .map((i) => ({ i, score: seen.reduce((n, s) => n + (s.type === i.type ? 1 : 0.5) * similarity(s, i), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.i);
}
