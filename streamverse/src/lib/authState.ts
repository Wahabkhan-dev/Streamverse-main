/**
 * Lightweight reactive auth state for the real-API (non-demo) mode.
 * Stores the current user returned by GET /auth/me in memory and lets
 * components subscribe to it via useSyncExternalStore.
 */
import { useSyncExternalStore } from "react";
import type { ApiUser } from "@/api/types";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  user: ApiUser | null;
}

let state: AuthState = { status: "loading", user: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setAuthUser(user: ApiUser | null) {
  state = { status: user ? "authenticated" : "unauthenticated", user };
  emit();
}

export function setAuthLoading() {
  state = { ...state, status: "loading" };
  emit();
}

export function clearAuthUser() {
  state = { status: "unauthenticated", user: null };
  emit();
}

export function getAuthUser(): ApiUser | null {
  return state.user;
}

export function getAuthStatus(): AuthStatus {
  return state.status;
}

/* ─────────── React hooks ─────────── */

export function useAuthState(): AuthState {
  return useSyncExternalStore(subscribe, () => state, () => ({ status: "loading" as const, user: null }));
}

export function useApiUser(): ApiUser | null {
  return useSyncExternalStore(subscribe, () => state.user, () => null);
}

export function useAuthStatus(): AuthStatus {
  return useSyncExternalStore(subscribe, () => state.status, () => "loading" as const);
}

/** True once the auth check has resolved (either authenticated or not). */
export function useAuthReady(): boolean {
  return useSyncExternalStore(subscribe, () => state.status !== "loading", () => false);
}

export function useIsAuthenticated(): boolean {
  return useSyncExternalStore(subscribe, () => state.status === "authenticated", () => false);
}
