/**
 * Session lifecycle for real-API mode: restore on boot, sign in, sign out, and which pages need a session.
 * The backend stays the source of truth (access token + httpOnly refresh cookie); this only keeps the screens in step.
 */
import type { QueryClient } from "@tanstack/react-query";
import { authApi } from "@/api/auth.api";
import { clearAccessToken, getAccessToken, isApiError, setAccessToken } from "@/api/client";
import type { ApiUser } from "@/api/types";
import { clearAuthUser, setAuthError, setAuthLoading, setAuthUser, getAuthUser } from "./authState";
import { DEMO_MODE } from "./config";
import { removeAllDownloads } from "./offline/downloads";
import { isUnreachable } from "./offline/shim";
import { resetUser, setRole, updateUser } from "./user";

/* ───────────── cache isolation ───────────── */

let queryClient: QueryClient | null = null;
export const registerQueryClient = (c: QueryClient) => {
  queryClient = c;
};
/** Everything cached for a customer (My List, library, history, notifications, progress...) goes when the customer changes. */
export const dropUserCaches = () => queryClient?.clear();

/* ───────────── which pages need a session ───────────── */

const ACCOUNT_PAGES = /^\/(my-list|my-library|downloads|history|notifications|profile|subscription|payment-methods|admin)(\/|$)/;
const PLAYER_PAGES = /^\/(watch|read|listen|flipbook)\/[^/]+/;

/** Pages that need a signed-in customer. A trailer on /watch is public. */
export function requiresLogin(pathname: string, searchStr = ""): boolean {
  if (DEMO_MODE) return false;
  if (ACCOUNT_PAGES.test(pathname)) return true;
  if (PLAYER_PAGES.test(pathname)) return !(pathname.startsWith("/watch/") && /(^|[?&])trailer=/.test(searchStr));
  return false;
}

/** Only an address inside this site is ever followed after sign-in (never another origin, never a login/register page). */
export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return null;
  try {
    if (new URL(value, "http://x.invalid").origin !== "http://x.invalid") return null;
  } catch {
    return null;
  }
  if (/^\/(sign-in|sign-up|signup|forgot-password|reset-password)(\/|\?|#|$)/.test(value)) return null;
  return value;
}

const RETURN_KEY = "sv-return-to";
/** Remembered across the sign-up steps (plan, account, payment) so a new customer still lands where they were headed. */
export function rememberReturnTo(path: string | null) {
  try {
    if (path) sessionStorage.setItem(RETURN_KEY, path);
    else sessionStorage.removeItem(RETURN_KEY);
  } catch {
    /* storage unavailable */
  }
}
export function takeReturnTo(): string | null {
  try {
    const v = safeReturnTo(sessionStorage.getItem(RETURN_KEY));
    sessionStorage.removeItem(RETURN_KEY);
    return v;
  } catch {
    return null;
  }
}

/* ───────────── mirror into the local user store ───────────── */

/** The screens that still read the browser store (profile name, role) follow the server's answer. Call after the store hydrated. */
export function mirrorAuthUser(user: ApiUser | null) {
  if (!user) {
    setRole("user");
    return;
  }
  updateUser((s) => ({
    ...s,
    role: user.role,
    profile: {
      ...s.profile,
      email: user.email,
      name: user.fullName,
      ...(user.preferences?.country ? { country: user.preferences.country } : {}),
      ...(user.preferences?.preferredLanguage ? { language: user.preferences.preferredLanguage } : {}),
    },
  }));
}

/* ───────────── the last confirmed customer (offline starts) ───────────── */

const LAST_USER_KEY = "sv-last-user";
const saveLastUser = (user: ApiUser) => {
  try {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(user));
  } catch {
    /* storage unavailable: an offline start simply cannot restore the customer */
  }
};
const loadLastUser = (): ApiUser | null => {
  try {
    return JSON.parse(localStorage.getItem(LAST_USER_KEY) ?? "null") as ApiUser | null;
  } catch {
    return null;
  }
};
const clearLastUser = () => {
  try {
    localStorage.removeItem(LAST_USER_KEY);
  } catch {
    /* nothing stored */
  }
};

/* ───────────── boot / restore ───────────── */

let booting: Promise<void> | null = null;

/**
 * Checks the existing session ONCE (shared by every caller, started as early as the app loads). No token = guest at once.
 * A rejected session ends it; a network/server failure does not: it is reported as an error so nobody is shown a guest header.
 */
export function bootstrapAuth(force = false): Promise<void> {
  if (DEMO_MODE) return Promise.resolve();
  if (booting && !force) return booting;
  if (!getAccessToken()) {
    clearAuthUser();
    return Promise.resolve();
  }
  setAuthLoading();
  booting = authApi
    .me()
    .then((res) => {
      const previous = loadLastUser();
      if (previous && previous.id !== res.data.id) void removeAllDownloads(); // another customer's copies never stay behind
      saveLastUser(res.data);
      setAuthUser(res.data);
    })
    .catch((err: unknown) => {
      if (isApiError(err) && (err.status === 401 || err.status === 403)) {
        // client.ts already tried the refresh cookie once; if we are here the session really is gone
        clearAccessToken();
        clearAuthUser({ expired: true });
      } else if (isUnreachable(err) || !navigator.onLine) {
        // No internet / server unreachable: carry on as the customer who was signed in (their saved downloads open);
        // nothing is granted by the server until it can be asked again.
        const last = loadLastUser();
        if (last) setAuthUser(last);
        else setAuthError();
      } else {
        setAuthError();
      }
    })
    .finally(() => {
      booting = null;
    });
  return booting;
}

/** Re-reads who is signed in without showing a loading state (e.g. after the customer changed their name). */
export function refreshAuthUser(): Promise<void> {
  if (DEMO_MODE) return Promise.resolve();
  return authApi.me().then((res) => { saveLastUser(res.data); setAuthUser(res.data); }).catch(() => undefined);
}

/* ───────────── sign in / out ───────────── */

/** Login or sign-up succeeded: store the token, drop any previous customer's caches, update the header at once. */
export function completeSignIn(user: ApiUser, accessToken: string) {
  const previous = getAuthUser();
  setAccessToken(accessToken);
  if (!previous || previous.id !== user.id) {
    dropUserCaches();
    void removeAllDownloads();
  }
  saveLastUser(user);
  setAuthUser(user);
  mirrorAuthUser(user);
}

/** Sign out: tell the server, forget the session here, and wipe everything cached for this customer. */
export function signOut() {
  if (!DEMO_MODE) void authApi.logout().catch(() => undefined); // best effort; reads the token before it is cleared
  clearAccessToken();
  clearAuthUser();
  clearLastUser();
  dropUserCaches();
  void removeAllDownloads();
  resetUser();
  rememberReturnTo(null);
}
