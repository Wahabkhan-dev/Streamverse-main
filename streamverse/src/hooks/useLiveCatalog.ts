import { useMemo } from "react";
import { DEMO_MODE } from "@/lib/config";
import { apiBookToLocal, apiMovieToLocal } from "@/lib/api-mappers";
import { buildCatalog, useCatalog } from "@/lib/items";
import { useApiAudiobooksQuery, useApiEbooksQuery, useApiMoviesQuery } from "./useApiCatalog";

/** Same request as the browse pages, so they share one cached copy. */
const ALL = { page: 1, limit: 100 } as const;

/**
 * The catalog of titles that actually exist: the local demo store in demo mode, the server's published titles in
 * live mode. Anything that links to a title (up next, search suggestions, pickers) must use this rather than
 * `useCatalog()`, which only ever holds the demo titles, so a link built from it opens a page that 404s in live mode.
 */
export function useLiveCatalog(enabled = true) {
  const demo = useCatalog();
  // `enabled: false` waits until it is needed (the header search box is on every page, but only used when opened)
  const movies = useApiMoviesQuery(ALL, enabled);
  const ebooks = useApiEbooksQuery(ALL, enabled);
  const audiobooks = useApiAudiobooksQuery(ALL, enabled);
  const live = useMemo(
    () =>
      buildCatalog(
        (movies.data?.data ?? []).map(apiMovieToLocal),
        (ebooks.data?.data ?? []).map(apiBookToLocal),
        (audiobooks.data?.data ?? []).map(apiBookToLocal),
      ),
    [movies.data, ebooks.data, audiobooks.data],
  );
  return DEMO_MODE ? demo : live;
}
