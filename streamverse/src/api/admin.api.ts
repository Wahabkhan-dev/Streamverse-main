import { api } from "./client";
import type {
  ApiDashboardSummary,
  ApiPlatformStatus,
  ApiRevenueSeries,
  ApiUserGrowth,
  ApiResponse,
  ApiMeta,
  ApiMovie,
  ApiBook,
  ApiGenre,
  ApiGenreInput,
  ApiContentKind,
  ApiTag,
  ApiLanguage,
  ApiCollection,
  ApiBanner,
  ApiHomeSection,
  ApiLegalPage,
  ApiAdminSettings,
  ApiAdminUser,
  ApiAdminPayment,
  ApiAdminAnalytics,
  ApiPlan,
  ApiSubscription,
  ApiPresignedUpload,
} from "./types";

/** What GET /admin/content/:id/stats returns (completionRate is 0..1, averageProgress is a percentage) */
export interface ApiTitleStats {
  uniqueUsers: number;
  starts: number;
  completions: number;
  completionRate: number;
  myListAdds: number;
  averageProgress?: number;
}

export interface AdminListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: string;
}

function toQuery(p?: AdminListParams): string {
  if (!p) return "";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/* ─────────────────────────────── Content ────────────────────────────────── */

/** Every row of an admin list: the server sends at most 100 per page (20 when no limit is given). */
async function listAll<T>(path: string): Promise<ApiResponse<T[]> & { meta: ApiMeta }> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const res = await api.get<ApiResponse<T[]> & { pagination?: { totalPages: number } }>(`${path}?page=${page}&limit=100`);
    out.push(...res.data);
    if (!res.pagination || page >= res.pagination.totalPages) break;
  }
  return { data: out, meta: { total: out.length } };
}

export const adminMoviesApi = {
  list: (p?: AdminListParams) =>
    api.get<ApiResponse<ApiMovie[]> & { meta: ApiMeta }>(`/admin/movies${toQuery(p)}`),
  listAll: () => listAll<ApiMovie>("/admin/movies"),
  get: (id: string) => api.get<ApiResponse<ApiMovie>>(`/admin/movies/${id}`),
  create: (data: Partial<ApiMovie>) => api.post<ApiResponse<ApiMovie>>("/admin/movies", data),
  update: (id: string, data: Partial<ApiMovie>) =>
    api.patch<ApiResponse<ApiMovie>>(`/admin/movies/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/admin/movies/${id}`),
  publish: (id: string) =>
    api.post<ApiResponse<ApiMovie>>(`/admin/movies/${id}/publish`),
  unpublish: (id: string) =>
    api.post<ApiResponse<ApiMovie>>(`/admin/movies/${id}/unpublish`),
  archive: (id: string) => api.post<ApiResponse<ApiMovie>>(`/admin/movies/${id}/archive`),
};

export const adminEbooksApi = {
  list: (p?: AdminListParams) =>
    api.get<ApiResponse<ApiBook[]> & { meta: ApiMeta }>(`/admin/ebooks${toQuery(p)}`),
  listAll: () => listAll<ApiBook>("/admin/ebooks"),
  get: (id: string) => api.get<ApiResponse<ApiBook>>(`/admin/ebooks/${id}`),
  create: (data: Partial<ApiBook>) => api.post<ApiResponse<ApiBook>>("/admin/ebooks", data),
  update: (id: string, data: Partial<ApiBook>) =>
    api.patch<ApiResponse<ApiBook>>(`/admin/ebooks/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/admin/ebooks/${id}`),
  publish: (id: string) => api.post<ApiResponse<ApiBook>>(`/admin/ebooks/${id}/publish`),
  unpublish: (id: string) => api.post<ApiResponse<ApiBook>>(`/admin/ebooks/${id}/unpublish`),
  archive: (id: string) => api.post<ApiResponse<ApiBook>>(`/admin/ebooks/${id}/archive`),
};

export const adminAudiobooksApi = {
  list: (p?: AdminListParams) =>
    api.get<ApiResponse<ApiBook[]> & { meta: ApiMeta }>(`/admin/audiobooks${toQuery(p)}`),
  listAll: () => listAll<ApiBook>("/admin/audiobooks"),
  get: (id: string) => api.get<ApiResponse<ApiBook>>(`/admin/audiobooks/${id}`),
  create: (data: Partial<ApiBook>) =>
    api.post<ApiResponse<ApiBook>>("/admin/audiobooks", data),
  update: (id: string, data: Partial<ApiBook>) =>
    api.patch<ApiResponse<ApiBook>>(`/admin/audiobooks/${id}`, data),
  delete: (id: string) =>
    api.delete<ApiResponse<{ message: string }>>(`/admin/audiobooks/${id}`),
  publish: (id: string) => api.post<ApiResponse<ApiBook>>(`/admin/audiobooks/${id}/publish`),
  unpublish: (id: string) =>
    api.post<ApiResponse<ApiBook>>(`/admin/audiobooks/${id}/unpublish`),
  archive: (id: string) => api.post<ApiResponse<ApiBook>>(`/admin/audiobooks/${id}/archive`),
};

/* ─────────────────────────────── Taxonomy ───────────────────────────────── */

export const adminGenresApi = {
  list: () => api.get<ApiResponse<ApiGenre[]>>("/admin/genres"),
  create: (data: ApiGenreInput) => api.post<ApiResponse<ApiGenre>>("/admin/genres", data),
  /** `contentType: null` makes the genre apply to every kind of title again */
  update: (id: string, data: { name?: string; description?: string | null; contentType?: ApiContentKind | null; active?: boolean }) =>
    api.put<ApiResponse<ApiGenre>>(`/admin/genres/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/admin/genres/${id}`),
};

export const adminTagsApi = {
  list: () => api.get<ApiResponse<ApiTag[]>>("/admin/tags"),
  create: (name: string) => api.post<ApiResponse<ApiTag>>("/admin/tags", { name }),
  update: (id: string, name: string) =>
    api.patch<ApiResponse<ApiTag>>(`/admin/tags/${id}`, { name }),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/admin/tags/${id}`),
};

export const adminLanguagesApi = {
  list: () => api.get<ApiResponse<ApiLanguage[]>>("/admin/languages"),
  create: (data: Pick<ApiLanguage, "name" | "code">) =>
    api.post<ApiResponse<ApiLanguage>>("/admin/languages", data),
  delete: (id: string) =>
    api.delete<ApiResponse<{ message: string }>>(`/admin/languages/${id}`),
};

/* ─────────────────────────────── Collections ────────────────────────────── */

export const adminCollectionsApi = {
  list: (p?: AdminListParams) =>
    api.get<ApiResponse<ApiCollection[]>>(`/admin/collections${toQuery(p)}`),
  get: (id: string) => api.get<ApiResponse<ApiCollection>>(`/admin/collections/${id}`),
  create: (data: Partial<ApiCollection>) =>
    api.post<ApiResponse<ApiCollection>>("/admin/collections", data),
  update: (id: string, data: Partial<ApiCollection>) =>
    api.put<ApiResponse<ApiCollection>>(`/admin/collections/${id}`, data),
  delete: (id: string) =>
    api.delete<ApiResponse<{ message: string }>>(`/admin/collections/${id}`),
  publish: (id: string) =>
    api.post<ApiResponse<ApiCollection>>(`/admin/collections/${id}/publish`),
  unpublish: (id: string) =>
    api.post<ApiResponse<ApiCollection>>(`/admin/collections/${id}/unpublish`),
};

/* ─────────────────────────────── Homepage / Banners ─────────────────────── */

export const adminHomepageApi = {
  list: () => api.get<ApiResponse<ApiHomeSection[]>>("/admin/homepage/sections"),
  create: (data: { key: string; displayTitle: string; type: ApiHomeSection["type"]; contentType?: string; bannerId?: string; collectionId?: string; enabled?: boolean; displayOrder?: number; itemLimit?: number }) =>
    api.post<ApiResponse<ApiHomeSection>>("/admin/homepage/sections", data),
  updateSection: (id: string, data: { displayTitle?: string; enabled?: boolean; itemLimit?: number; type?: ApiHomeSection["type"]; displayOrder?: number; expectedUpdatedAt?: string }) =>
    api.put<ApiResponse<ApiHomeSection>>(`/admin/homepage/sections/${id}`, data),
  reorder: (items: { id: string; displayOrder: number }[]) =>
    api.put<ApiResponse<null>>("/admin/homepage/sections/reorder", items),
  remove: (id: string) =>
    api.delete<ApiResponse<null>>(`/admin/homepage/sections/${id}`),
  addItem: (sectionId: string, data: { contentId: string; displayOrder?: number }) =>
    api.post<ApiResponse<unknown>>(`/admin/homepage/sections/${sectionId}/items`, data),
  removeItem: (sectionId: string, contentId: string) =>
    api.delete<ApiResponse<null>>(`/admin/homepage/sections/${sectionId}/items/${contentId}`),
};

export const adminBannersApi = {
  list: () => api.get<ApiResponse<ApiBanner[]>>("/admin/banners"),
  get: (id: string) => api.get<ApiResponse<ApiBanner>>(`/admin/banners/${id}`),
  create: (data: Partial<ApiBanner>) =>
    api.post<ApiResponse<ApiBanner>>("/admin/banners", data),
  update: (id: string, data: Partial<ApiBanner>) =>
    api.put<ApiResponse<ApiBanner>>(`/admin/banners/${id}`, data),
  delete: (id: string) =>
    api.delete<ApiResponse<{ message: string }>>(`/admin/banners/${id}`),
};

/* ─────────────────────────────── Legal ──────────────────────────────────── */

export const adminLegalApi = {
  list: () => api.get<ApiResponse<ApiLegalPage[]>>("/admin/legal"),
  get: (type: "privacy" | "terms" | "refund") =>
    api.get<ApiResponse<ApiLegalPage>>(`/admin/legal/${type}`),
  update: (type: "privacy" | "terms" | "refund", data: { content: string; title?: string }) =>
    api.put<ApiResponse<ApiLegalPage>>(`/admin/legal/${type}`, data),
};

/* ─────────────────────────────── Settings ───────────────────────────────── */

export const adminSettingsApi = {
  get: () => api.get<ApiResponse<ApiAdminSettings>>("/admin/settings"),
  update: (data: Record<string, boolean | string | number>) =>
    api.put<ApiResponse<ApiAdminSettings>>("/admin/settings", data),
};

/* ─────────────────────────────── Plans ──────────────────────────────────── */

export const adminPlansApi = {
  list: () => api.get<ApiResponse<ApiPlan[]>>("/admin/plans"),
  get: (id: string) => api.get<ApiResponse<ApiPlan>>(`/admin/plans/${id}`),
  create: (data: Partial<ApiPlan>) => api.post<ApiResponse<ApiPlan>>("/admin/plans", data),
  update: (id: string, data: Partial<ApiPlan>) =>
    api.put<ApiResponse<ApiPlan>>(`/admin/plans/${id}`, data),
  /** A plan is retired by deactivating it (never deleted: subscriptions and payments may reference it). */
  delete: (id: string) => api.put<ApiResponse<ApiPlan>>(`/admin/plans/${id}`, { active: false }),
  activate: (id: string) => api.put<ApiResponse<ApiPlan>>(`/admin/plans/${id}`, { active: true }),
  deactivate: (id: string) => api.put<ApiResponse<ApiPlan>>(`/admin/plans/${id}`, { active: false }),
};

/* ─────────────────────────────── Users ──────────────────────────────────── */

export const adminUsersApi = {
  list: (p?: AdminListParams) =>
    api.get<ApiResponse<ApiAdminUser[]> & { meta: ApiMeta }>(`/admin/users${toQuery(p)}`),
  get: (id: string) => api.get<ApiResponse<ApiAdminUser>>(`/admin/users/${id}`),
  update: (id: string, data: Partial<ApiAdminUser>) =>
    api.patch<ApiResponse<ApiAdminUser>>(`/admin/users/${id}`, data),
  suspend: (id: string) =>
    api.post<ApiResponse<{ message: string }>>(`/admin/users/${id}/suspend`),
  unsuspend: (id: string) =>
    api.post<ApiResponse<{ message: string }>>(`/admin/users/${id}/unsuspend`),
  delete: (id: string) =>
    api.delete<ApiResponse<{ message: string }>>(`/admin/users/${id}`),
};

/* ─────────────────────────────── Subscriptions ──────────────────────────── */

export const adminSubscriptionsApi = {
  list: (p?: AdminListParams) =>
    api.get<ApiResponse<ApiSubscription[]> & { meta: ApiMeta }>(
      `/admin/subscriptions${toQuery(p)}`,
    ),
  get: (id: string) => api.get<ApiResponse<ApiSubscription>>(`/admin/subscriptions/${id}`),
  cancel: (id: string) =>
    api.post<ApiResponse<{ message: string }>>(`/admin/subscriptions/${id}/cancel`),
  refund: (id: string) =>
    api.post<ApiResponse<{ message: string }>>(`/admin/subscriptions/${id}/refund`),
};

/* ─────────────────────────────── Payments ───────────────────────────────── */

export const adminPaymentsApi = {
  list: (p?: AdminListParams) =>
    api.get<ApiResponse<ApiAdminPayment[]> & { meta: ApiMeta }>(
      `/admin/payments${toQuery(p)}`,
    ),
  get: (id: string) => api.get<ApiResponse<ApiAdminPayment>>(`/admin/payments/${id}`),
  refund: (id: string) =>
    api.post<ApiResponse<{ message: string }>>(`/admin/payments/${id}/refund`),
};

/* ─────────────────────────────── Analytics ──────────────────────────────── */

export const adminAnalyticsApi = {
  getDashboard() {
    return api.get<ApiResponse<ApiAdminAnalytics>>("/admin/dashboard");
  },

  getRevenue(params?: { from?: string; to?: string; interval?: "day" | "month" | "year" }) {
    const q = new URLSearchParams();
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    if (params?.interval) q.set("groupBy", params.interval === "year" ? "month" : params.interval);
    const qs = q.toString();
    return api.get<ApiResponse<ApiRevenueSeries>>(`/admin/analytics/revenue${qs ? `?${qs}` : ""}`);
  },

  getSummary() {
    return api.get<ApiResponse<ApiDashboardSummary>>("/admin/dashboard/summary");
  },

  getPlatformStatus() {
    return api.get<ApiResponse<ApiPlatformStatus>>("/admin/dashboard/platform-status");
  },

  /** GET /admin/content/:id/stats: one title's real audience numbers, for `{ range: "7d" | "30d" | "90d" }` or `{ from, to }` */
  titleStats(contentId: string, params: Record<string, string>) {
    return api.get<ApiResponse<ApiTitleStats>>(`/admin/content/${contentId}/stats?${new URLSearchParams(params).toString()}`);
  },

  /** GET /admin/analytics/:kind with a range / filter query: subscriptions, movies, ebooks, audiobooks, top-content, top-genres */
  report<T>(kind: string, params: Record<string, string>) {
    return api.get<ApiResponse<T>>(`/admin/analytics/${kind}?${new URLSearchParams(params).toString()}`);
  },

  getUserGrowth(params: { from: string; to: string; groupBy: "day" | "week" | "month" }) {
    const q = new URLSearchParams(params);
    return api.get<ApiResponse<ApiUserGrowth>>(`/admin/analytics/users?${q.toString()}`);
  },

  getAuditLogs(p?: AdminListParams) {
    return api.get<
      ApiResponse<
        Array<{
          id: string;
          userId?: string;
          action: string;
          resource: string;
          resourceId?: string;
          meta?: Record<string, unknown>;
          createdAt: string;
        }>
      > & { meta: ApiMeta }
    >(`/admin/audit-logs${toQuery(p)}`);
  },
};
