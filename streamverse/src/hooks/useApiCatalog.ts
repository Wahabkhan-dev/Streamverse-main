import { useQuery } from "@tanstack/react-query";
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

export function useApiBannersQuery() {
  return useQuery({
    queryKey: BANNERS_QUERY_KEY,
    queryFn: async () => {
      const res = await catalogApi.getBanners();
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
