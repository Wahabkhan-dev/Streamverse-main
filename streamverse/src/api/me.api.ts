import { api } from "./client";
import type {
  ApiResponse,
  ApiUser,
  ApiMeta,
  ApiSubscription,
  ApiInvoice,
  ApiPaymentMethod,
  ApiSetupIntent,
  ApiCheckoutSession,
  ApiBillingPortal,
  ApiListItem,
  ApiProgress,
  ApiHistoryEntry,
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

  /** POST /me/subscription/checkout — returns Stripe checkout URL */
  checkout(planId: string) {
    return api.post<ApiResponse<ApiCheckoutSession>>("/me/subscription/checkout", { planId });
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
    return api.post<ApiResponse<ApiSetupIntent>>("/me/payment-methods/setup-intent");
  },

  setDefaultPaymentMethod(paymentMethodId: string) {
    return api.patch<ApiResponse<ApiPaymentMethod>>(
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
    return api.get<ApiResponse<ApiListItem[]>>("/me/my-list");
  },

  addToMyList(contentId: string, contentType: "movie" | "ebook" | "audiobook") {
    return api.post<ApiResponse<ApiListItem>>(`/me/my-list/${contentId}`, { contentType });
  },

  removeFromMyList(contentId: string) {
    return api.delete<ApiResponse<{ message: string }>>(`/me/my-list/${contentId}`);
  },

  /* ────────── Library ────────── */

  getLibrary() {
    return api.get<ApiResponse<ApiListItem[]>>("/me/library");
  },

  addToLibrary(contentId: string, contentType: "movie" | "ebook" | "audiobook") {
    return api.post<ApiResponse<ApiListItem>>(`/me/library/${contentId}`, { contentType });
  },

  removeFromLibrary(contentId: string) {
    return api.delete<ApiResponse<{ message: string }>>(`/me/library/${contentId}`);
  },

  /* ────────── Progress ────────── */

  getContinueWatching() {
    return api.get<ApiResponse<ApiProgress[]>>("/me/continue");
  },

  /** GET /me/progress/:type/:id */
  getProgress(type: "movie" | "ebook" | "audiobook", contentId: string) {
    return api.get<ApiResponse<ApiProgress>>(`/me/progress/${type}/${contentId}`);
  },

  /** PUT /me/progress/:type/:id */
  saveProgress(
    type: "movie" | "ebook" | "audiobook",
    contentId: string,
    data: {
      percentage: number;
      positionSeconds?: number;
      positionPage?: number;
      chapterIndex?: number;
      chapterSeconds?: number;
      completed?: boolean;
    },
  ) {
    return api.put<ApiResponse<ApiProgress>>(`/me/progress/${type}/${contentId}`, data);
  },

  /* ────────── History ────────── */

  getHistory(page = 1, limit = 20) {
    return api.get<ApiResponse<ApiHistoryEntry[]> & { meta: ApiMeta }>(
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
