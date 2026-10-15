/**
 * Utility functions to convert API response types to the local UI types
 * used by the demo mode catalog. These are used when DEMO_MODE=false.
 */
import type { ApiMovie, ApiBook, ApiCollection } from "@/api/types";
import type { Movie, Book, Status, ItemRef } from "@/lib/data";
import { toItem, type Item } from "@/lib/items";
import type { Collection } from "@/lib/store";

/** Convert an ApiMovie to the local Movie shape expected by UI components. */
export function apiMovieToLocal(m: ApiMovie): Movie {
  const mins = m.duration ?? 0;
  const h = Math.floor(mins / 60);
  const min = mins % 60;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    slug: m.slug,
    title: m.title,
    year: m.year,
    genres: m.genres,
    runtime: h > 0 ? `${h}h ${min}m` : `${min}m`,
    rating: m.rating ?? "PG",
    badges: [],
    description: m.description,
    image: m.image,
    status: (m.status ?? "Published") as Status,
    views: m.views ?? 0,
    release: `${m.year}-01-01`,
    cast: m.cast.map((c) => ({ name: c.name, role: c.role })),
    cid: m.id,
    ...(m.promo !== undefined ? { promo: m.promo } : {}),
    ...(m.restrictions
      ? {
          restrictions: {
            ...(m.restrictions.access !== undefined
              ? { access: (m.restrictions.access === "Subscription" ? "Subscribers Only" : m.restrictions.access) as "Public" | "Subscribers Only" }
              : {}),
          },
        }
      : {}),
    ...(m.language !== undefined || m.audio !== undefined || m.subtitles !== undefined || m.director !== undefined
      ? {
          info: {
            ...(m.language !== undefined ? { language: m.language } : {}),
            ...(m.audio !== undefined ? { audio: m.audio } : {}),
            ...(m.subtitles !== undefined ? { subtitles: m.subtitles } : {}),
            ...(m.director !== undefined ? { director: m.director } : {}),
          },
        }
      : {}),
  } as Movie;
}

/** Convert an ApiBook to the local Book shape expected by UI components. */
export function apiBookToLocal(b: ApiBook): Book {
  return {
    slug: b.slug,
    title: b.title,
    author: b.author,
    genre: b.genres[0] ?? "Fiction",
    rating: 4.0,
    reviews: 0,
    pages: b.pages ?? 0,
    year: b.year ?? new Date().getFullYear(),
    description: b.description,
    palette: ["oklch(0.3 0.05 240)", "oklch(0.2 0.05 240)", "oklch(0.8 0.1 240)"] as [string, string, string],
    motif: "sun",
    status: (b.status ?? "Published") as Status,
    isbn: "",
    count: 0,
    ...(b.narrator !== undefined ? { narrator: b.narrator } : {}),
    ...(b.image ? { cover: b.image } : {}),
    cid: b.id,
    ...(b.promo !== undefined ? { promo: b.promo } : {}),
    ...(b.restrictions
      ? {
          restrictions: {
            ...(b.restrictions.access !== undefined
              ? { access: (b.restrictions.access === "Subscription" ? "Subscribers Only" : b.restrictions.access) as "Public" | "Subscribers Only" }
              : {}),
          },
        }
      : {}),
    ...(b.language !== undefined || b.languages !== undefined || b.publisher !== undefined || b.tags !== undefined
      ? {
          info: {
            ...(b.language !== undefined ? { language: b.language } : {}),
            ...(b.languages !== undefined ? { languages: b.languages } : {}),
            ...(b.publisher !== undefined ? { publisher: b.publisher } : {}),
            ...(b.tags !== undefined ? { tags: b.tags } : {}),
          },
        }
      : {}),
    ...(b.duration !== undefined ? { duration: `${Math.floor(b.duration / 60)}h ${b.duration % 60}m` } : {}),
  } as Book;
}

/** Convert an ApiCollection to the local Collection shape expected by UI components. */
export function apiCollectionToLocal(c: ApiCollection): Collection {
  const items: ItemRef[] = c.items
    .sort((a, b) => a.position - b.position)
    .map((item) => {
      const slug =
        (item.contentType === "movie" ? item.movie?.slug : item.contentType === "ebook" ? item.ebook?.slug : item.audiobook?.slug) ?? item.contentId;
      const id =
        (item.contentType === "movie" ? item.movie?.id : item.contentType === "ebook" ? item.ebook?.id : item.audiobook?.id) ?? undefined;
      const type: ItemRef["type"] =
        item.contentType === "movie" ? "Movie" : item.contentType === "ebook" ? "eBook" : "Audiobook";
      return id ? { type, slug, id } : { type, slug };
    });
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    cover: c.cover ?? "",
    status: c.status,
    items,
  };
}

/** Convert an ApiCollection's items to Item[] directly from embedded objects (avoids catalog lookup). */
export function apiCollectionToItems(c: ApiCollection): Item[] {
  return c.items
    .sort((a, b) => a.position - b.position)
    .flatMap((item) => {
      if (item.contentType === "movie" && item.movie) {
        const m = apiMovieToLocal(item.movie);
        return [{ type: "Movie" as const, slug: m.slug, m }];
      }
      if (item.contentType === "ebook" && item.ebook) {
        const b = apiBookToLocal(item.ebook);
        return [{ type: "eBook" as const, slug: b.slug, b }];
      }
      if (item.contentType === "audiobook" && item.audiobook) {
        const b = apiBookToLocal(item.audiobook);
        return [{ type: "Audiobook" as const, slug: b.slug, b }];
      }
      return [] as Item[];
    });
}

/** Convert an ApiMovie to an Item (for search / my-list / etc.). */
export function apiMovieToItem(m: ApiMovie): Item {
  return toItem("Movie", apiMovieToLocal(m));
}

/** Convert an ApiBook to an Item for eBooks. */
export function apiEbookToItem(b: ApiBook): Item {
  return toItem("eBook", apiBookToLocal(b));
}

/** Convert an ApiBook to an Item for audiobooks. */
export function apiAudiobookToItem(b: ApiBook): Item {
  return toItem("Audiobook", apiBookToLocal(b));
}
