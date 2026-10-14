import { api } from "./client";
import type { ApiResponse, ApiUser, AuthTokenResponse } from "./types";

export const authApi = {
  /** POST /auth/login */
  login(email: string, password: string) {
    return api.post<ApiResponse<AuthTokenResponse>>("/auth/login", { email, password });
  },

  /** POST /auth/register */
  register(name: string, email: string, password: string) {
    return api.post<ApiResponse<AuthTokenResponse>>("/auth/register", { name, email, password });
  },

  /** GET /auth/me — returns the currently authenticated user */
  me() {
    return api.get<ApiResponse<ApiUser>>("/auth/me");
  },

  /** POST /auth/logout — invalidates the current session */
  logout() {
    return api.post<ApiResponse<{ message: string }>>("/auth/logout");
  },

  /** POST /auth/logout-all — invalidates all sessions */
  logoutAll() {
    return api.post<ApiResponse<{ message: string }>>("/auth/logout-all");
  },

  /** POST /auth/refresh — exchange refresh cookie for a new access token */
  refresh() {
    return api.post<ApiResponse<{ accessToken: string }>>("/auth/refresh");
  },

  /** POST /auth/forgot-password */
  forgotPassword(email: string) {
    return api.post<ApiResponse<{ message: string }>>("/auth/forgot-password", { email });
  },

  /** POST /auth/reset-password */
  resetPassword(token: string, password: string) {
    return api.post<ApiResponse<{ message: string }>>("/auth/reset-password", { token, password });
  },

  /** POST /auth/change-password */
  changePassword(currentPassword: string, newPassword: string) {
    return api.post<ApiResponse<{ message: string }>>("/auth/change-password", {
      currentPassword,
      newPassword,
    });
  },
};
