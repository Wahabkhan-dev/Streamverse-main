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

let pendingRefresh: Promise<string | null> | null = null;

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

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  isRetry = false,
): Promise<T> {
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
  });

  // ── 401 → try refresh once ──
  if (res.status === 401 && !isRetry) {
    if (!pendingRefresh) {
      pendingRefresh = doRefresh().finally(() => {
        pendingRefresh = null;
      });
    }
    const newToken = await pendingRefresh;
    if (newToken) {
      return apiFetch<T>(path, init, true);
    }
    // Refresh failed — clear state and redirect
    clearAccessToken();
    if (typeof window !== "undefined") {
      window.location.href = "/sign-in";
    }
    throw new ApiError(401, "UNAUTHORIZED", "Session expired. Please sign in again.");
  }

  // ── Error responses ──
  if (!res.ok) {
    let code = "UNKNOWN";
    let message = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as {
        error?: { code?: string; message?: string };
        message?: string;
      };
      code = body.error?.code ?? code;
      message = body.error?.message ?? body.message ?? message;
    } catch {
      /* ignore parse failures */
    }
    throw new ApiError(res.status, code, message);
  }

  // ── 204 No Content ──
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return res.json() as Promise<T>;
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
