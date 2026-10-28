import { clearAuthUser } from "@/lib/authState";
import { setServerReachable } from "@/lib/connection";
import { API_BASE } from "@/lib/config";

const TOKEN_KEY = "sv-access-token";

/* ─────────────────────────────── Token helpers ─────────────────────────── */

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore — storage unavailable */
  }
}

export function clearAccessToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/* ─────────────────────────────── Error class ────────────────────────────── */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/* ─────────────────────────────── Refresh logic ──────────────────────────── */

/**
 * Endpoints whose 401 means "bad credentials / no session" rather than "access token expired". They must never
 * trigger a refresh: a failed login retrying through /auth/refresh (which itself 401s) is what produced a
 * refresh-and-reload storm for anonymous visitors.
 */
const NO_REFRESH_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/auth/forgot-password",
  "/auth/reset-password",
];

let pendingRefresh: Promise<string | null> | null = null;
/**
 * After a refresh fails the session is dead. Every other request that was already in flight will also come back 401
 * moments later; without this they would each try (and fail) their own refresh, multiplying calls against a
 * rate-limited endpoint. Within this window they fail straight away instead.
 */
let lastRefreshFailedAt = 0;
const REFRESH_COOLDOWN_MS = 10_000;

async function doRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include", // sends httpOnly sv_refresh_token cookie
    });
    if (!res.ok) {
      clearAccessToken();
      return null;
    }
    const json = (await res.json()) as { data?: { accessToken?: string } };
    const token = json.data?.accessToken ?? null;
    if (token) setAccessToken(token);
    return token;
  } catch {
    clearAccessToken();
    return null;
  }
}

/* ─────────────────────────────── Core fetch ────────────────────────────── */

async function apiFetch<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers as HeadersInit | undefined);

  if (!headers.has("Content-Type") && init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include", // always include for refresh cookie
  }).catch((err: unknown) => {
    // no answer at all (server down, blocked network, offline): the site shows a "can't reach StreamVerse" bar
    setServerReachable(false);
    throw err;
  });
  setServerReachable(true); // any answer, even an error status, means the server is there

  // ── 401 → try refresh once ──
  if (res.status === 401 && !isRetry && !NO_REFRESH_PATHS.some((p) => path.startsWith(p))) {
    let newToken: string | null = null;
    if (Date.now() - lastRefreshFailedAt >= REFRESH_COOLDOWN_MS) {
      if (!pendingRefresh) {
        pendingRefresh = doRefresh().finally(() => {
          pendingRefresh = null;
        });
      }
      newToken = await pendingRefresh;
      if (!newToken) lastRefreshFailedAt = Date.now();
      else lastRefreshFailedAt = 0;
    }
    if (newToken) {
      return apiFetch<T>(path, init, true);
    }
    // Refresh failed: the session is over. Forget it; the route guard sends the visitor to Sign In from a protected page
    // (public pages simply carry on as a guest). No hard reload, so there is no redirect loop.
    clearAccessToken();
    if (token) clearAuthUser({ expired: true });
    throw new ApiError(401, "UNAUTHORIZED", "Your session has expired. Please sign in again.");
  }

  // ── Error responses ──
  if (!res.ok) {
    let code = "UNKNOWN";
    let message = `Request failed: ${res.status} ${res.statusText}`;
    try {
      // The API's envelope is { success, message, errors, code, requestId } — `code` is top-level.
      const body = (await res.json()) as {
        code?: string;
        error?: { code?: string; message?: string };
        message?: string;
        errors?: Array<{ message?: string }>;
      };
      code = body.code ?? body.error?.code ?? code;
      message = body.error?.message ?? body.message ?? message;
      // a validation failure says WHAT was wrong (e.g. "this image is too small"), not just "Validation failed"
      const details = (body.errors ?? []).map((e) => e.message).filter(Boolean);
      if (details.length) message = details.join(" ");
    } catch {
      /* ignore parse failures */
    }
    throw new ApiError(res.status, code, message);
  }

  // ── 204 No Content ──
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const json = (await res.json()) as Record<string, unknown>;
  // The API names the paging block `pagination`; every consumer reads it as `meta` ({ page, limit, total, totalPages }).
  if (json && typeof json === "object" && json["pagination"] && !json["meta"])
    json["meta"] = json["pagination"];
  return json as T;
}

/* ─────────────────────────────── Public API ─────────────────────────────── */

export const api = {
  get<T>(path: string, init?: RequestInit): Promise<T> {
    return apiFetch<T>(path, { ...init, method: "GET" });
  },

  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    const extra: RequestInit = body !== undefined ? { body: JSON.stringify(body) } : {};
    return apiFetch<T>(path, { ...init, ...extra, method: "POST" });
  },

  put<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    const extra: RequestInit = body !== undefined ? { body: JSON.stringify(body) } : {};
    return apiFetch<T>(path, { ...init, ...extra, method: "PUT" });
  },

  patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    const extra: RequestInit = body !== undefined ? { body: JSON.stringify(body) } : {};
    return apiFetch<T>(path, { ...init, ...extra, method: "PATCH" });
  },

  delete<T>(path: string, init?: RequestInit): Promise<T> {
    return apiFetch<T>(path, { ...init, method: "DELETE" });
  },

  /** Upload a file to a pre-signed URL (no auth header, no JSON content-type). */
  uploadDirect(url: string, file: File, fields?: Record<string, string>): Promise<void> {
    if (fields) {
      // S3-style multipart form upload
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      form.append("file", file);
      return fetch(url, { method: "POST", body: form }).then((r) => {
        if (!r.ok) throw new ApiError(r.status, "UPLOAD_FAILED", "File upload failed");
      });
    }
    // Direct PUT upload (R2/S3 presigned PUT)
    return fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } }).then(
      (r) => {
        if (!r.ok) throw new ApiError(r.status, "UPLOAD_FAILED", "File upload failed");
      },
    );
  },
};
