/**
 * Utility functions to convert API response types to the local UI types
 * used by the demo mode catalog. These are used when DEMO_MODE=false.
 */
import placeholder from "@/assets/placeholder.svg";
import type { ApiMovie, ApiBook, ApiCollection, ApiMixedCard } from "@/api/types";
import type { Movie, Book, Status, ItemRef } from "@/lib/data";
import { toItem, type Item } from "@/lib/items";
import type { Collection } from "@/lib/store";

/** Convert an ApiMovie to the local Movie shape expected by UI components. */
/** Backend content status (DB enum, upper-case) -> the label the UI uses. */
export function uiStatus(status: string | undefined): Status {
  switch ((status ?? "PUBLISHED").toUpperCase()) {
    case "PUBLISHED": return "Published";
    case "SCHEDULED": return "Scheduled";
    case "UNPUBLISHED": return "Unpublished";
    case "ARCHIVED": return "Archived";
    case "PROCESSING": return "Processing";
    case "PROCESSING_FAILED": return "Failed";
    default: return "Draft";
  }
}

/** The customer API sends `releaseDate`; the admin/legacy shape sent `year`. */
const yearOf = (x: { year?: number | undefined; releaseDate?: string | null | undefined }): number =>
  x.year ?? (x.releaseDate ? new Date(x.releaseDate).getUTCFullYear() : new Date().getFullYear());

const hm = (totalMinutes: number) => {
  const h = Math.floor(totalMinutes / 60);
  const min = Math.round(totalMinutes % 60);
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
};

const clock = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = String(Math.round(secs % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

/**
 * An audiobook detail's chapters as the player reads them (title + length, laid end to end from 0:00). A chapter's length is
 * its saved duration, else the gap to the next chapter's start, else what is left of the book; "" when none of those is known.
 */
function bookChapters(b: ApiBook): { title: string; duration: string }[] | undefined {
  if (!Array.isArray(b.chapters) || b.chapters.length === 0) return undefined;
  const list = [...b.chapters].sort((x, y) => x.chapterNumber - y.chapterNumber);
  return list.map((c, i) => {
    const start = c.startTimeSeconds ?? null;
    const nextStart = list[i + 1]?.startTimeSeconds ?? null;
    const secs =
      c.durationSeconds ??
      (start !== null && nextStart !== null
        ? nextStart - start
        : start !== null && b.durationSeconds
          ? b.durationSeconds - start
          : 0);
    return { title: c.title, duration: secs > 0 ? clock(secs) : "" };
  });
}

export function apiMovieToLocal(m: ApiMovie): Movie {
  const mins = m.runtimeMinutes ?? m.duration ?? 0;
  const year = yearOf(m);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    slug: m.slug,
    title: m.title,
    year,
    genres: m.genres,
    runtime: hm(mins),
    // age classification (e.g. "13+"); the API's own `rating` is a numeric user score, not this
    rating: m.ageRating ?? (typeof m.rating === "string" ? m.rating : "NR"),
    badges: [],
    description: m.description ?? m.summary ?? "",
    image: m.image ?? placeholder,
    status: uiStatus(m.status),
    views: m.views ?? 0,
    release: m.releaseDate ? m.releaseDate.slice(0, 10) : `${year}-01-01`,
    // detail responses name the character `characterName`; the legacy shape called it `role`
    cast: (m.cast ?? []).map((c) => ({ name: c.name, role: c.role ?? (c as { characterName?: string }).characterName ?? "" })),
    cid: m.id,
    ...(m.hasTrailer !== undefined ? { hasTrailer: m.hasTrailer } : {}),
    ...(m.hasTeaser !== undefined ? { hasTeaser: m.hasTeaser } : {}),
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
  const chapters = bookChapters(b);
  return {
    slug: b.slug,
    title: b.title,
    author: b.author ?? "",
    genre: b.genres[0] ?? "Fiction",
    rating: 4.0,
    reviews: 0,
    pages: b.pageCount ?? b.pages ?? 0,
    year: yearOf(b),
    description: b.description ?? b.summary ?? "",
    palette: ["oklch(0.3 0.05 240)", "oklch(0.2 0.05 240)", "oklch(0.8 0.1 240)"] as [string, string, string],
    motif: "sun",
    status: uiStatus(b.status),
    isbn: "",
    count: 0,
    ...(b.narrator ? { narrator: b.narrator } : {}),
    ...(b.image ? { cover: b.image } : {}),
    cid: b.id,
    ...(b.flipbook ? { flipbook: true } : {}),
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
    ...(b.language !== undefined || b.languages !== undefined || b.publisher !== undefined || b.tags !== undefined || chapters
      ? {
          info: {
            ...(b.language !== undefined ? { language: b.language } : {}),
            ...(b.languages !== undefined ? { languages: b.languages } : {}),
            ...(b.publisher ? { publisher: b.publisher } : {}),
            ...(b.tags !== undefined ? { tags: b.tags } : {}),
            ...(chapters ? { chapters } : {}),
          },
        }
      : {}),
    ...(b.durationSeconds ? { duration: hm(b.durationSeconds / 60) } : b.duration !== undefined ? { duration: hm(b.duration) } : {}),
  } as Book;
}

/** Convert an ApiCollection to the local Collection shape expected by UI components. */
/** GET /collections/:slug sends its items as mixed cards (in display order, each with its `type`); older payloads used
 * { contentId, contentType, movie|ebook|audiobook, position }. Both are read. */
const isCard = (item: unknown): item is ApiMixedCard => !!item && typeof (item as { type?: unknown }).type === "string" && "slug" in (item as object);
const CARD_TYPE: Record<string, ItemRef["type"]> = { MOVIE: "Movie", EBOOK: "eBook", AUDIOBOOK: "Audiobook" };

export function apiCollectionToLocal(c: ApiCollection): Collection {
  const raw = (c.items ?? []) as unknown[];
  const items: ItemRef[] = raw.every(isCard)
    ? (raw as ApiMixedCard[]).filter((card) => CARD_TYPE[card.type]).map((card) => ({ type: CARD_TYPE[card.type]!, slug: card.slug, id: card.id }))
    : [...(c.items ?? [])]
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
    cover: c.cover ?? c.image ?? placeholder,
    status: c.status,
    items,
    ...(c.itemCount !== undefined ? { itemCount: c.itemCount } : {}),
  };
}

/** Convert an ApiCollection's items to Item[] directly from embedded objects (avoids catalog lookup). */
export function apiCollectionToItems(c: ApiCollection): Item[] {
  const raw = (c.items ?? []) as unknown[];
  if (raw.every(isCard)) return (raw as ApiMixedCard[]).filter((card) => CARD_TYPE[card.type]).map(mixedCardToItem);
  return [...(c.items ?? [])]
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

/** Any mixed content card (My List / Library / History / Continue / search / collections) -> a typed catalog Item. */
export function mixedCardToItem(c: ApiMixedCard): Item {
  const shared = {
    id: c.id,
    slug: c.slug,
    title: c.title,
    summary: c.summary ?? null,
    genres: c.genres,
    releaseDate: c.releaseDate ?? null,
    ageRating: c.ageRating ?? null,
    image: c.image ?? null,
    ...(c.description ? { description: c.description } : {}),
  };
  if (c.type === "MOVIE") {
    const mins = /^(\d+)\s*min/.exec(c.headline ?? "")?.[1];
    return toItem("Movie", apiMovieToLocal({ ...shared, ...(mins ? { runtimeMinutes: Number(mins) } : {}) }));
  }
  const isBook = c.type === "EBOOK";
  return toItem(isBook ? "eBook" : "Audiobook", apiBookToLocal({ ...shared, author: isBook ? (c.headline ?? null) : null, ...(isBook || !c.headline ? {} : { narrator: c.headline }) }));
}
