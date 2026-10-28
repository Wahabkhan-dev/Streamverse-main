import { readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { API, FIXTURES } from "./env";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown>;

/** Thin typed client over the REAL backend. No mocking, no demo data. */
export class Api {
  constructor(public token?: string) {}

  async raw(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Response> {
    return fetch(`${API}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...extra,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  async call<T = Json>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T; meta?: Json }> {
    const res = await this.raw(method, path, body);
    const text = await res.text();
    const json = text ? (JSON.parse(text) as { data: T; meta?: Json; message?: string }) : ({} as { data: T });
    if (!res.ok) throw new ApiError(res.status, json, `${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
    return { status: res.status, data: json.data, ...(json.meta ? { meta: json.meta } : {}) };
  }

  get = <T = Json>(path: string) => this.call<T>("GET", path);
  post = <T = Json>(path: string, body?: unknown) => this.call<T>("POST", path, body ?? {});
  put = <T = Json>(path: string, body?: unknown) => this.call<T>("PUT", path, body ?? {});
  del = <T = Json>(path: string, body?: unknown) => this.call<T>("DELETE", path, body ?? {});
}

export interface UploadedAsset {
  assetId: string;
  status: string;
}

/**
 * The exact flow a browser follows, minus the browser's CORS constraint: presign -> PUT bytes straight to R2
 * with the signed URL -> tell the backend it is done (it HEADs the object and validates it).
 */
export async function uploadAsset(
  admin: Api,
  opts: { contentId: string; purpose: string; file: string; mimeType: string; languageId?: string },
): Promise<UploadedAsset> {
  const path = join(FIXTURES, opts.file);
  const bytes = readFileSync(path);
  const presigned = (
    await admin.post<{ assetId: string; uploadUrl: string; method: string; headers: Record<string, string> }>("/admin/uploads/presign", {
      contentId: opts.contentId,
      purpose: opts.purpose,
      fileName: basename(opts.file),
      mimeType: opts.mimeType,
      sizeBytes: statSync(path).size,
      ...(opts.languageId ? { languageId: opts.languageId } : {}),
    })
  ).data;

  const put = await fetch(presigned.uploadUrl, { method: presigned.method, headers: presigned.headers, body: bytes });
  if (!put.ok) throw new Error(`R2 PUT for ${opts.purpose} failed: ${put.status} ${(await put.text()).slice(0, 200)}`);

  const done = (await admin.post<{ status: string }>(`/admin/uploads/${presigned.assetId}/complete`)).data;
  return { assetId: presigned.assetId, status: done.status };
}

/** Polls the upload status until the asset is READY, failing loudly on FAILED or timeout. */
export async function waitForAssetReady(admin: Api, assetId: string, timeoutMs = 180_000): Promise<Json> {
  const deadline = Date.now() + timeoutMs;
  let last: Json = {};
  while (Date.now() < deadline) {
    last = (await admin.get<Json>(`/admin/uploads/${assetId}/status`)).data;
    if (last["status"] === "READY") return last;
    if (last["status"] === "FAILED") throw new Error(`asset ${assetId} FAILED: ${JSON.stringify(last)}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`asset ${assetId} not READY after ${timeoutMs}ms; last=${JSON.stringify(last)}`);
}
