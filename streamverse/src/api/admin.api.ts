import { api } from "./client";
import type {
  ApiResponse,
  ApiMeta,
  ApiMovie,
  ApiBook,
  ApiGenre,
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

export const adminMoviesApi = {
  list: (p?: AdminListParams) =>
    api.get<ApiResponse<ApiMovie[]> & { meta: ApiMeta }>(`/admin/movies${toQuery(p)}`),
  get: (id: string) => api.get<ApiResponse<ApiMovie>>(`/admin/movies/${id}`),
  create: (data: Partial<ApiMovie>) => api.post<ApiResponse<ApiMovie>>("/admin/movies", data),
  update: (id: string, data: Partial<ApiMovie>) =>
    api.patch<ApiResponse<ApiMovie>>(`/admin/movies/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/admin/movies/${id}`),
  publish: (id: string) =>
    api.post<ApiResponse<ApiMovie>>(`/admin/movies/${id}/publish`),
  unpublish: (id: string) =>
    api.post<ApiResponse<ApiMovie>>(`/admin/movies/${id}/unpublish`),
};

export const adminEbooksApi = {
  list: (p?: AdminListParams) =>
    api.get<ApiResponse<ApiBook[]> & { meta: ApiMeta }>(`/admin/ebooks${toQuery(p)}`),
  get: (id: string) => api.get<ApiResponse<ApiBook>>(`/admin/ebooks/${id}`),
  create: (data: Partial<ApiBook>) => api.post<ApiResponse<ApiBook>>("/admin/ebooks", data),
  update: (id: string, data: Partial<ApiBook>) =>
    api.patch<ApiResponse<ApiBook>>(`/admin/ebooks/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/admin/ebooks/${id}`),
  publish: (id: string) => api.post<ApiResponse<ApiBook>>(`/admin/ebooks/${id}/publish`),
  unpublish: (id: string) => api.post<ApiResponse<ApiBook>>(`/admin/ebooks/${id}/unpublish`),
};

export const adminAudiobooksApi = {
  list: (p?: AdminListParams) =>
    api.get<ApiResponse<ApiBook[]> & { meta: ApiMeta }>(`/admin/audiobooks${toQuery(p)}`),
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
};

/* ─────────────────────────────── Taxonomy ───────────────────────────────── */

export const adminGenresApi = {
  list: () => api.get<ApiResponse<ApiGenre[]>>("/admin/genres"),
  create: (data: Pick<ApiGenre, "name" | "type">) =>
    api.post<ApiResponse<ApiGenre>>("/admin/genres", data),
  update: (id: string, data: Partial<ApiGenre>) =>
    api.patch<ApiResponse<ApiGenre>>(`/admin/genres/${id}`, data),
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
    api.patch<ApiResponse<ApiCollection>>(`/admin/collections/${id}`, data),
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
  update: (sections: ApiHomeSection[]) =>
    api.put<ApiResponse<ApiHomeSection[]>>("/admin/homepage/sections", { sections }),
  updateSection: (id: string, data: Partial<ApiHomeSection>) =>
    api.patch<ApiResponse<ApiHomeSection>>(`/admin/homepage/sections/${id}`, data),
};

export const adminBannersApi = {
  list: () => api.get<ApiResponse<ApiBanner[]>>("/admin/banners"),
  get: (id: string) => api.get<ApiResponse<ApiBanner>>(`/admin/banners/${id}`),
  create: (data: Partial<ApiBanner>) =>
    api.post<ApiResponse<ApiBanner>>("/admin/banners", data),
  update: (id: string, data: Partial<ApiBanner>) =>
    api.patch<ApiResponse<ApiBanner>>(`/admin/banners/${id}`, data),
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
  update: (data: Partial<ApiAdminSettings>) =>
    api.patch<ApiResponse<ApiAdminSettings>>("/admin/settings", data),
};

/* ─────────────────────────────── Plans ──────────────────────────────────── */

export const adminPlansApi = {
  list: () => api.get<ApiResponse<ApiPlan[]>>("/admin/plans"),
  get: (id: string) => api.get<ApiResponse<ApiPlan>>(`/admin/plans/${id}`),
  create: (data: Partial<ApiPlan>) => api.post<ApiResponse<ApiPlan>>("/admin/plans", data),
  update: (id: string, data: Partial<ApiPlan>) =>
    api.patch<ApiResponse<ApiPlan>>(`/admin/plans/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/admin/plans/${id}`),
  activate: (id: string) => api.post<ApiResponse<ApiPlan>>(`/admin/plans/${id}/activate`),
  deactivate: (id: string) => api.post<ApiResponse<ApiPlan>>(`/admin/plans/${id}/deactivate`),
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
    if (params?.interval) q.set("interval", params.interval);
    const qs = q.toString();
    return api.get<ApiResponse<ApiAdminAnalytics>>(`/admin/analytics${qs ? `?${qs}` : ""}`);
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

/* ─────────────────────────────── Media uploads ──────────────────────────── */

export const adminMediaApi = {
  /** Request a presigned URL for direct upload to R2/S3 */
  requestUpload(data: {
    filename: string;
    contentType: string;
    type: "movie-poster" | "ebook-cover" | "audiobook-cover" | "movie-video" | "audiobook-audio" | "ebook-file" | "banner";
    contentId?: string;
  }) {
    return api.post<ApiResponse<ApiPresignedUpload>>("/admin/uploads/presign", data);
  },

  /** Confirm that a direct upload completed successfully */
  confirmUpload(key: string, contentId?: string) {
    return api.post<ApiResponse<{ publicUrl: string }>>("/admin/uploads/confirm", {
      key,
      contentId,
    });
  },

  /** Delete a media file by its key */
  deleteMedia(key: string) {
    return api.delete<ApiResponse<{ message: string }>>(`/admin/media/${encodeURIComponent(key)}`);
  },
};
