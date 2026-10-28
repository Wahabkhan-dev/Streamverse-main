import { api } from "./client";
import type {
  ApiResponse,
  ApiUser,
  ApiMeta,
  ApiSubscription,
  ApiInvoice,
  ApiPaymentMethod,
  ApiSetupIntent,
  ApiSyncedSubscription,
  ApiCheckoutSession,
  ApiBillingPortal,
  ApiMixedCard,
  ApiProgress,
  ApiBookmark,
  ApiNotification,
} from "./types";

export const meApi = {
  /* ────────── Profile ────────── */

  getProfile() {
    return api.get<ApiResponse<ApiUser>>("/me/profile");
  },

  updateProfile(data: { fullName?: string; country?: string | null; preferredLanguage?: string | null; subtitleLanguage?: string | null; audioLanguage?: string | null; videoQuality?: string | null; audiobookSpeed?: number | null }) {
    return api.patch<ApiResponse<ApiUser>>("/me/profile", data);
  },

  deleteAccount() {
    return api.delete<ApiResponse<{ message: string }>>("/me/profile");
  },

  verifyAge() {
    return api.post<ApiResponse<{ message: string }>>("/me/age-verification");
  },

  /* ────────── Subscription ────────── */

  getSubscription() {
    return api.get<ApiResponse<ApiSubscription>>("/me/subscription");
  },

  /** POST /me/subscription/payment-intent — client secret for the embedded payment box (Stripe Elements) */
  createPaymentIntent(planId: string) {
    return api.post<ApiResponse<{ clientSecret: string; subscriptionId: string }>>("/me/subscription/payment-intent", { planId });
  },

  /** POST /me/subscription/sync — pull the latest state from Stripe right after a payment (no webhook needed) */
  syncSubscription() {
    return api.post<ApiResponse<ApiSyncedSubscription>>("/me/subscription/sync");
  },

  /** POST /me/subscription/checkout — returns Stripe checkout URL */
  checkout(planId: string, opts: { popup?: boolean } = {}) {
    return api.post<ApiResponse<ApiCheckoutSession>>("/me/subscription/checkout", { planId, ...opts });
  },

  cancelSubscription() {
    return api.post<ApiResponse<{ message: string }>>("/me/subscription/cancel");
  },

  resumeSubscription() {
    return api.post<ApiResponse<{ message: string }>>("/me/subscription/resume");
  },

  changePlan(planId: string) {
    return api.post<ApiResponse<ApiSubscription>>("/me/subscription/change-plan", { planId });
  },

  /** POST /me/billing-portal — returns Stripe billing portal URL */
  billingPortal() {
    return api.post<ApiResponse<ApiBillingPortal>>("/me/billing-portal");
  },

  getInvoices() {
    return api.get<ApiResponse<ApiInvoice[]>>("/me/payments");
  },

  /* ────────── Payment Methods ────────── */

  getPaymentMethods() {
    return api.get<ApiResponse<ApiPaymentMethod[]>>("/me/payment-methods");
  },

  /** POST /me/payment-methods/setup-intent — returns Stripe SetupIntent client secret */
  createSetupIntent() {
    return api.post<ApiResponse<ApiSetupIntent>>("/me/payment-methods/setup");
  },

  setDefaultPaymentMethod(paymentMethodId: string) {
    return api.post<ApiResponse<ApiPaymentMethod>>(
      `/me/payment-methods/${paymentMethodId}/default`,
    );
  },

  deletePaymentMethod(paymentMethodId: string) {
    return api.delete<ApiResponse<{ message: string }>>(
      `/me/payment-methods/${paymentMethodId}`,
    );
  },

  /* ────────── My List ────────── */

  getMyList() {
    return api.get<ApiResponse<ApiMixedCard[]>>("/me/my-list");
  },

  addToMyList(contentId: string, contentType: "movie" | "ebook" | "audiobook") {
    return api.post<ApiResponse<null>>(`/me/my-list/${contentId}`, { contentType });
  },

  removeFromMyList(contentId: string) {
    return api.delete<ApiResponse<{ message: string }>>(`/me/my-list/${contentId}`);
  },

  /* ────────── Library ────────── */

  getLibrary() {
    return api.get<ApiResponse<ApiMixedCard[]>>("/me/library");
  },

  addToLibrary(contentId: string, contentType: "movie" | "ebook" | "audiobook") {
    return api.post<ApiResponse<null>>(`/me/library/${contentId}`, { contentType });
  },

  removeFromLibrary(contentId: string) {
    return api.delete<ApiResponse<{ message: string }>>(`/me/library/${contentId}`);
  },

  /* ────────── Progress ────────── */

  getContinueWatching() {
    return api.get<ApiResponse<ApiProgress[]>>("/me/continue");
  },

  /** POST /me/playback-sessions/:id/heartbeat — keeps a stream slot alive while playing */
  heartbeatSession(sessionId: string) {
    return api.post<ApiResponse<null>>(`/me/playback-sessions/${sessionId}/heartbeat`, {});
  },
  /** POST /me/playback-sessions/:id/end — gives a stream slot back */
  endSession(sessionId: string) {
    return api.post<ApiResponse<null>>(`/me/playback-sessions/${sessionId}/end`, {});
  },

  /** GET /me/progress/:type/:id */
  getProgress(type: "movie" | "ebook" | "audiobook", contentId: string) {
    return api.get<ApiResponse<ApiProgress>>(`/me/progress/${type}/${contentId}`);
  },

  /**
   * PUT /me/progress/:type/:id
   *
   * Callers describe progress in one friendly shape; this maps it onto each backend schema (which differ per
   * type: movies/audiobooks take whole seconds + optional duration, eBooks take an EPUB `location` or a PDF
   * `page`). The backend derives percentage/completion itself from position and duration.
   */
  saveProgress(
    type: "movie" | "ebook" | "audiobook",
    contentId: string,
    data: {
      percentage: number;
      positionSeconds?: number;
      durationSeconds?: number;
      positionPage?: number;
      /** EPUB CFI (or any reader-defined location string) */
      location?: string;
      chapterIndex?: number;
      chapterSeconds?: number;
      completed?: boolean;
    },
  ) {
    let body: Record<string, unknown>;
    if (type === "ebook") {
      body = {
        percentage: Math.max(0, Math.min(100, data.percentage)),
        ...(data.location ? { location: data.location } : {}),
        ...(data.positionPage ? { page: Math.max(1, Math.round(data.positionPage)) } : {}),
      };
      // the backend requires a location OR a page; an unknown spot is recorded as the start of the book
      if (body["location"] === undefined && body["page"] === undefined) body["page"] = 1;
    } else {
      const duration = data.durationSeconds ? Math.max(1, Math.round(data.durationSeconds)) : undefined;
      const position = Math.max(0, Math.floor(data.positionSeconds ?? 0));
      body = { positionSeconds: duration ? Math.min(position, duration) : position, ...(duration ? { durationSeconds: duration } : {}) };
    }
    return api.put<ApiResponse<ApiProgress>>(`/me/progress/${type}/${contentId}`, body);
  },

  /* ────────── History ────────── */

  getHistory(page = 1, limit = 20) {
    return api.get<ApiResponse<ApiMixedCard[]> & { meta: ApiMeta }>(
      `/me/history?page=${page}&limit=${limit}`,
    );
  },

  deleteHistoryItem(contentId: string) {
    return api.delete<ApiResponse<{ message: string }>>(`/me/history/${contentId}`);
  },

  clearHistory() {
    return api.delete<ApiResponse<{ message: string }>>("/me/history");
  },

  /* ────────── Bookmarks ────────── */

  getBookmarks(ebookId: string) {
    return api.get<ApiResponse<ApiBookmark[]>>(`/me/ebooks/${ebookId}/bookmarks`);
  },

  addBookmark(ebookId: string, page: number, note?: string) {
    return api.post<ApiResponse<ApiBookmark>>(`/me/ebooks/${ebookId}/bookmarks`, { page, note });
  },

  removeBookmark(ebookId: string, bookmarkId: string) {
    return api.delete<ApiResponse<{ message: string }>>(`/me/ebooks/${ebookId}/bookmarks/${bookmarkId}`);
  },

  /* ────────── Notifications ────────── */

  getNotifications() {
    return api.get<ApiResponse<ApiNotification[]>>("/me/notifications");
  },

  markNotificationRead(id: string) {
    return api.post<ApiResponse<ApiNotification>>(`/me/notifications/${id}/read`);
  },

  markAllNotificationsRead() {
    return api.post<ApiResponse<{ message: string }>>("/me/notifications/read-all");
  },

  deleteNotification(id: string) {
    return api.delete<ApiResponse<{ message: string }>>(`/me/notifications/${id}`);
  },
};
