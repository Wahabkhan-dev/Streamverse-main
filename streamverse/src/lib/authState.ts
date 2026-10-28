/**
 * The ONE source of truth for "who is signed in" in real-API (non-demo) mode.
 *
 * Three explicit states, never a boolean that starts out as "logged out":
 *   loading          the session has not been checked yet (a request may be in flight)
 *   authenticated    the server confirmed a user
 *   unauthenticated  the server said there is no session (or there is no token to ask with)
 *
 * `error` is set when the session check itself failed (server down, network): that is NOT the same as "signed out", so the
 * status stays `loading` and the screens offer a retry instead of claiming the visitor is a guest.
 * `expired` is set when a session that existed was rejected, so Sign In can say so.
 */
import { useSyncExternalStore } from "react";
import type { ApiUser } from "@/api/types";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthState {
  status: AuthStatus;
  user: ApiUser | null;
  error: boolean;
  expired: boolean;
}

const TOKEN_KEY = "sv-access-token";

/** No stored token means there is nothing to verify: the visitor is a guest right away (no flash, no request). */
function initialStatus(): AuthStatus {
  if (typeof window === "undefined") return "loading";
  try {
    return window.localStorage.getItem(TOKEN_KEY) ? "loading" : "unauthenticated";
  } catch {
    return "unauthenticated";
  }
}

let state: AuthState = { status: initialStatus(), user: null, error: false, expired: false };
const SERVER_STATE: AuthState = { status: "loading", user: null, error: false, expired: false };
const listeners = new Set<() => void>();

function set(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setAuthUser(user: ApiUser | null) {
  set(user ? { status: "authenticated", user, error: false, expired: false } : { status: "unauthenticated", user: null, error: false, expired: false });
}

export function setAuthLoading() {
  set({ ...state, status: "loading", error: false });
}

/** The session check failed for a reason other than "no session" (server/network). Stays `loading`: never claims a guest. */
export function setAuthError() {
  set({ ...state, status: "loading", error: true });
}

export function clearAuthUser(opts: { expired?: boolean } = {}) {
  set({ status: "unauthenticated", user: null, error: false, expired: opts.expired === true });
}

export function getAuthUser(): ApiUser | null {
  return state.user;
}

export function getAuthStatus(): AuthStatus {
  return state.status;
}

export function getAuthState(): AuthState {
  return state;
}

/* ─────────── React hooks ─────────── */

export function useAuthState(): AuthState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

export function useApiUser(): ApiUser | null {
  return useAuthState().user;
}

export function useAuthStatus(): AuthStatus {
  return useAuthState().status;
}

/** True once the auth check has resolved (either authenticated or not). */
export function useAuthReady(): boolean {
  return useAuthState().status !== "loading";
}

export function useIsAuthenticated(): boolean {
  return useAuthState().status === "authenticated";
}
