import { detailOf, withLocalCopy } from "@/lib/offline/shim";
import { api } from "./client";
import type {
  ApiResponse,
  ApiMeta,
  ApiMovie,
  ApiBook,
  ApiCollection,
  ApiBanner,
  ApiHomeSection,
  ApiGenre,
  ApiTag,
  ApiLanguage,
  ApiAdminSettings,
} from "./types";

export interface CatalogListParams {
  page?: number;
  limit?: number;
  genre?: string;
  search?: string;
  sort?: string;
  status?: "Published" | "Draft";
  language?: string;
  year?: number;
  tag?: string;
}

function toQuery(params?: CatalogListParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const catalogApi = {
  /* ─────── Movies ─────── */

  listMovies(params?: CatalogListParams) {
    return api.get<ApiResponse<ApiMovie[]> & { meta: ApiMeta }>(`/movies${toQuery(params)}`);
  },

  getMovie(idOrSlug: string) {
    return withLocalCopy(idOrSlug, () => api.get<ApiResponse<ApiMovie>>(`/movies/${idOrSlug}`), (r) => detailOf<ApiMovie>(r));
  },

  /* ─────── eBooks ─────── */

  listEbooks(params?: CatalogListParams) {
    return api.get<ApiResponse<ApiBook[]> & { meta: ApiMeta }>(`/ebooks${toQuery(params)}`);
  },

  getEbook(idOrSlug: string) {
    return withLocalCopy(idOrSlug, () => api.get<ApiResponse<ApiBook>>(`/ebooks/${idOrSlug}`), (r) => detailOf<ApiBook>(r));
  },

  /* ─────── Audiobooks ─────── */

  listAudiobooks(params?: CatalogListParams) {
    return api.get<ApiResponse<ApiBook[]> & { meta: ApiMeta }>(`/audiobooks${toQuery(params)}`);
  },

  getAudiobook(idOrSlug: string) {
    return withLocalCopy(idOrSlug, () => api.get<ApiResponse<ApiBook>>(`/audiobooks/${idOrSlug}`), (r) => detailOf<ApiBook>(r));
  },

  /* ─────── Homepage ─────── */

  /** Sections are returned in displayOrder; `offset`/`limit` page through them so the first screenful can load first. */
  getHomepage(page?: { offset: number; limit: number }) {
    const q = page ? `?offset=${page.offset}&limit=${page.limit}` : "";
    return api.get<ApiResponse<ApiHomeSection[]> & { meta?: { total?: number } }>(`/homepage${q}`);
  },

  /* ─────── Banners ─────── */

  getBanners(placement?: "MOVIES" | "EBOOKS" | "AUDIOBOOKS") {
    return api.get<ApiResponse<ApiBanner[]>>(`/banners${placement ? `?placement=${placement}` : ""}`);
  },

  /* ─────── Collections ─────── */

  listCollections() {
    return api.get<ApiResponse<ApiCollection[]>>("/collections");
  },

  getCollection(idOrSlug: string) {
    return api.get<ApiResponse<ApiCollection>>(`/collections/${idOrSlug}`);
  },

  /* ─────── Genres / Tags / Languages ─────── */

  listGenres(type?: string) {
    const q = type ? `?type=${type}` : "";
    return api.get<ApiResponse<ApiGenre[]>>(`/genres${q}`);
  },

  listTags() {
    return api.get<ApiResponse<ApiTag[]>>("/tags");
  },

  listLanguages() {
    return api.get<ApiResponse<ApiLanguage[]>>("/languages");
  },

  /* ─────── Public settings ─────── */

  getPublicSettings() {
    return api.get<ApiResponse<Pick<ApiAdminSettings, "maintenance" | "registration" | "ageGate">>>(
      "/settings/public",
    );
  },
};
