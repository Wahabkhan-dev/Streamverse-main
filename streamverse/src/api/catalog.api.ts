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
    return api.get<ApiResponse<ApiMovie>>(`/movies/${idOrSlug}`);
  },

  /* ─────── eBooks ─────── */

  listEbooks(params?: CatalogListParams) {
    return api.get<ApiResponse<ApiBook[]> & { meta: ApiMeta }>(`/ebooks${toQuery(params)}`);
  },

  getEbook(idOrSlug: string) {
    return api.get<ApiResponse<ApiBook>>(`/ebooks/${idOrSlug}`);
  },

  /* ─────── Audiobooks ─────── */

  listAudiobooks(params?: CatalogListParams) {
    return api.get<ApiResponse<ApiBook[]> & { meta: ApiMeta }>(`/audiobooks${toQuery(params)}`);
  },

  getAudiobook(idOrSlug: string) {
    return api.get<ApiResponse<ApiBook>>(`/audiobooks/${idOrSlug}`);
  },

  /* ─────── Homepage ─────── */

  getHomepage() {
    return api.get<ApiResponse<ApiHomeSection[]>>("/homepage");
  },

  /* ─────── Banners ─────── */

  getBanners() {
    return api.get<ApiResponse<ApiBanner[]>>("/banners");
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
