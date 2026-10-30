import { useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogApi, type CatalogListParams } from "@/api/catalog.api";
import { DEMO_MODE } from "@/lib/config";

export const MOVIES_QUERY_KEY = (p?: CatalogListParams) => ["catalog", "movies", p] as const;
export const EBOOKS_QUERY_KEY = (p?: CatalogListParams) => ["catalog", "ebooks", p] as const;
export const AUDIOBOOKS_QUERY_KEY = (p?: CatalogListParams) => ["catalog", "audiobooks", p] as const;
export const HOMEPAGE_QUERY_KEY = ["catalog", "homepage"] as const;
export const BANNERS_QUERY_KEY = ["catalog", "banners"] as const;
export const COLLECTIONS_QUERY_KEY = ["catalog", "collections"] as const;

export function useApiMoviesQuery(params?: CatalogListParams) {
  return useQuery({
    queryKey: MOVIES_QUERY_KEY(params),
    queryFn: async () => {
      const res = await catalogApi.listMovies(params);
      return res;
    },
    enabled: !DEMO_MODE,
    staleTime: 5 * 60 * 1000,
  });
}

export function useApiMovieQuery(idOrSlug: string) {
  return useQuery({
    queryKey: ["catalog", "movie", idOrSlug] as const,
    queryFn: async () => {
      const res = await catalogApi.getMovie(idOrSlug);
      return res.data;
    },
    enabled: !DEMO_MODE && !!idOrSlug,
    staleTime: 10 * 60 * 1000,
  });
}

export function useApiEbooksQuery(params?: CatalogListParams) {
  return useQuery({
    queryKey: EBOOKS_QUERY_KEY(params),
    queryFn: async () => {
      const res = await catalogApi.listEbooks(params);
      return res;
    },
    enabled: !DEMO_MODE,
    staleTime: 5 * 60 * 1000,
  });
}

export function useApiEbookQuery(idOrSlug: string) {
  return useQuery({
    queryKey: ["catalog", "ebook", idOrSlug] as const,
    queryFn: async () => {
      const res = await catalogApi.getEbook(idOrSlug);
      return res.data;
    },
    enabled: !DEMO_MODE && !!idOrSlug,
    staleTime: 10 * 60 * 1000,
  });
}

export function useApiAudiobooksQuery(params?: CatalogListParams) {
  return useQuery({
    queryKey: AUDIOBOOKS_QUERY_KEY(params),
    queryFn: async () => {
      const res = await catalogApi.listAudiobooks(params);
      return res;
    },
    enabled: !DEMO_MODE,
    staleTime: 5 * 60 * 1000,
  });
}

export function useApiAudiobookQuery(idOrSlug: string) {
  return useQuery({
    queryKey: ["catalog", "audiobook", idOrSlug] as const,
    queryFn: async () => {
      const res = await catalogApi.getAudiobook(idOrSlug);
      return res.data;
    },
    enabled: !DEMO_MODE && !!idOrSlug,
    staleTime: 10 * 60 * 1000,
  });
}

export function useApiHomepageQuery() {
  return useQuery({
    queryKey: HOMEPAGE_QUERY_KEY,
    queryFn: async () => {
      const res = await catalogApi.getHomepage();
      return res.data;
    },
    enabled: !DEMO_MODE,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The whole homepage in ONE request (the server caches and pre-warms exactly this one), so every section appears together
 * instead of trickling in. Kept fresh in the background; the last copy is shown instantly on return visits.
 */
export function useApiHomepagePages() {
  return useQuery({
    queryKey: [...HOMEPAGE_QUERY_KEY, "all"],
    queryFn: () => catalogApi.getHomepage({ offset: 0, limit: 100 }),
    enabled: !DEMO_MODE,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useApiBannersQuery(placement?: "MOVIES" | "EBOOKS" | "AUDIOBOOKS") {
  return useQuery({
    queryKey: placement ? [...BANNERS_QUERY_KEY, placement] : BANNERS_QUERY_KEY,
    queryFn: async () => {
      const res = await catalogApi.getBanners(placement);
      return res.data;
    },
    enabled: !DEMO_MODE,
    staleTime: 5 * 60 * 1000,
  });
}

export function useApiCollectionsQuery() {
  return useQuery({
    queryKey: COLLECTIONS_QUERY_KEY,
    queryFn: async () => {
      const res = await catalogApi.listCollections();
      return res.data;
    },
    enabled: !DEMO_MODE,
    staleTime: 5 * 60 * 1000,
  });
}

export function useApiCollectionQuery(idOrSlug: string) {
  return useQuery({
    queryKey: ["catalog", "collection", idOrSlug] as const,
    queryFn: async () => {
      const res = await catalogApi.getCollection(idOrSlug);
      return res.data;
    },
    enabled: !DEMO_MODE && !!idOrSlug,
    staleTime: 10 * 60 * 1000,
  });
}

/** Finds a title the app has already downloaded (homepage rows or any list) so a detail page can show it before its own request returns. */
export function useCachedCard(slug: string): { title: string; image?: string | null; description?: string | null } | null {
  const qc = useQueryClient();
  if (DEMO_MODE || !slug) return null;
  const hit = (o: unknown): { title: string; image?: string | null; description?: string | null } | null => {
    if (!o || typeof o !== "object") return null;
    const c = o as { slug?: unknown; title?: unknown; image?: unknown; posterUrl?: unknown; description?: unknown; summary?: unknown };
    if (c.slug === slug && typeof c.title === "string") {
      const image = (c.image ?? c.posterUrl) as string | null | undefined;
      return { title: c.title, image: image ?? null, description: (c.description ?? c.summary ?? null) as string | null };
    }
    return null;
  };
  for (const [, data] of qc.getQueriesData<{ data?: unknown }>({ queryKey: ["catalog"] })) {
    const rows = (data as { data?: unknown } | undefined)?.data;
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      const direct = hit(r);
      if (direct) return direct;
      const items = (r as { items?: unknown })?.items; // a homepage section
      if (Array.isArray(items)) for (const it of items) { const f = hit(it); if (f) return f; }
    }
  }
  return null;
}
