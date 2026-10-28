import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { catalogApi } from "@/api/catalog.api";
import type { ApiContentKind } from "@/api/types";
import { DEMO_MODE } from "@/lib/config";
import { useGenres, type Genre } from "@/lib/store";

export const GENRES_QUERY_KEY = ["catalog", "genres"] as const;

const KIND_LABEL: Record<ApiContentKind, Genre["type"]> = { MOVIE: "Movie", EBOOK: "eBook", AUDIOBOOK: "Audiobook" };

/**
 * The genres (categories) to pick from or filter by. Live mode: the server's active genres, so a genre an admin adds
 * shows up everywhere at once. Demo mode: the browser's demo list.
 */
export function useGenreCatalog(): Genre[] {
  const demo = useGenres();
  const live = useQuery({
    queryKey: GENRES_QUERY_KEY,
    queryFn: async () => (await catalogApi.listGenres()).data,
    enabled: !DEMO_MODE,
    staleTime: 60_000,
  });
  return useMemo(
    () => (DEMO_MODE ? demo : (live.data ?? []).map((g) => ({ id: g.id, name: g.name, type: g.contentType ? KIND_LABEL[g.contentType] : "All" }))),
    [demo, live.data],
  );
}

/** Genre filter pills / dropdown options for one kind of title: "All" first, then the genres that apply to it. */
export function useGenreNames(kind: "Movie" | "eBook" | "Audiobook"): string[] {
  const genres = useGenreCatalog();
  return useMemo(
    // audiobooks share the eBook (book) categories
    () => ["All", ...genres.filter((g) => g.type === "All" || g.type === kind || (g.type === "eBook" && kind === "Audiobook")).map((g) => g.name)],
    [genres, kind],
  );
}
