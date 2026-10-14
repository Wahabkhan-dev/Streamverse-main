import { useMemo } from "react";
import type { Book, ItemRef, ItemType, Movie, Restrictions, Status } from "./data";
import { useAudiobooks, useEbooks, useMovies } from "./store";

/** A catalog entry of any type, so lists can mix movies, eBooks and audiobooks. */
export type Item = { type: "Movie"; slug: string; m: Movie } | { type: "eBook" | "Audiobook"; slug: string; b: Book };

export const toItem = (type: ItemType, e: Movie | Book): Item => (type === "Movie" ? { type, slug: e.slug, m: e as Movie } : { type, slug: e.slug, b: e as Book });
export const itemTitle = (i: Item) => (i.type === "Movie" ? i.m.title : i.b.title);
export const itemEntity = (i: Item): Movie | Book => (i.type === "Movie" ? i.m : i.b);
export const typeLabel = (t: ItemType) => (t === "Movie" ? "Movies" : t === "eBook" ? "eBooks" : "Audiobooks");
/** The stable pointer for a catalog entry. Store this, never the slug alone. */
export const refOf = (i: Item): ItemRef => {
  const cid = itemEntity(i).cid;
  return cid ? { type: i.type, slug: i.slug, id: cid } : { type: i.type, slug: i.slug };
};
/** Finds a title by its stable id when the pointer has one, otherwise by slug (old saves). */
const findBy = <T extends { slug: string; cid?: string | undefined }>(list: T[], r: ItemRef) => (r.id ? list.find((x) => x.cid === r.id) : list.find((x) => x.slug === r.slug));
export const todayIso = () => new Date().toISOString().slice(0, 10);

type Gated = { status: Status; restrictions?: Restrictions | undefined };

/** Visible in normal customer lists: published, not hidden, inside its availability window. */
export function isListed(x: Gated, today = todayIso()): boolean {
  if (x.status !== "Published") return false;
  const r = x.restrictions;
  if (r?.access === "Hidden") return false;
  if (r?.availableFrom && r.availableFrom > today) return false;
  if (r?.availableUntil && r.availableUntil < today) return false;
  return true;
}

/** The catalog read model: every list the customer site and admin screens use, derived from the stored titles. */
export function buildCatalog(movies: Movie[], ebooks: Book[], audiobooks: Book[]) {
  const resolve = (r: ItemRef): Item | undefined => {
    if (r.type === "Movie") {
      const m = findBy(movies, r);
      return m ? { type: "Movie", slug: m.slug, m } : undefined;
    }
    const b = findBy(r.type === "eBook" ? ebooks : audiobooks, r);
    return b ? { type: r.type, slug: b.slug, b } : undefined;
  };
  const all: Item[] = [...movies.map((m) => toItem("Movie", m)), ...ebooks.map((b) => toItem("eBook", b)), ...audiobooks.map((b) => toItem("Audiobook", b))];
  return {
    movies,
    ebooks,
    audiobooks,
    all,
    listed: all.filter((i) => isListed(itemEntity(i))),
    listedMovies: movies.filter((m) => isListed(m)),
    listedEbooks: ebooks.filter((b) => isListed(b)),
    listedAudiobooks: audiobooks.filter((b) => isListed(b)),
    resolve,
    resolveListed: (refs: ItemRef[]) => refs.map(resolve).filter((i): i is Item => !!i && isListed(itemEntity(i))),
  };
}

export function useCatalog() {
  const movies = useMovies();
  const ebooks = useEbooks();
  const audiobooks = useAudiobooks();
  return useMemo(() => buildCatalog(movies, ebooks, audiobooks), [movies, ebooks, audiobooks]);
}

/** Mock star rating for a movie (movies have none in the data yet): stable between renders. */
export const movieRating = (m: Movie) => Math.round((3.9 + (m.views % 11) / 10) * 10) / 10;
export const itemRating = (i: Item) => (i.type === "Movie" ? movieRating(i.m) : i.b.rating);
export const itemLanguage = (i: Item) => (i.type === "Movie" ? i.m.info?.language : i.b.info?.language) ?? "English";
export const itemGenres = (i: Item) => (i.type === "Movie" ? i.m.genres : [i.b.genre]);
export const itemYear = (i: Item) => (i.type === "Movie" ? i.m.year : i.b.year);
export const itemAge = (i: Item) => (i.type === "Movie" ? i.m.rating : (i.b.info?.readingAge ?? "All"));
