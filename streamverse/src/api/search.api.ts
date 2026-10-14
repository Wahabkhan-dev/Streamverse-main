import { api } from "./client";
import type { ApiResponse, ApiSearchResult, ApiSearchSuggestion } from "./types";

export const searchApi = {
  /** GET /search?q=... */
  search(query: string, params?: { page?: number; limit?: number; type?: string }) {
    const q = new URLSearchParams({ q: query });
    if (params?.page) q.set("page", String(params.page));
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.type) q.set("type", params.type);
    return api.get<ApiResponse<ApiSearchResult>>(`/search?${q.toString()}`);
  },

  /** GET /search/suggestions?q=... */
  suggestions(query: string) {
    return api.get<ApiResponse<ApiSearchSuggestion[]>>(
      `/search/suggestions?q=${encodeURIComponent(query)}`,
    );
  },
};
