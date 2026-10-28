import type { Page } from "@playwright/test";
import { API } from "./env";

export interface ApiCall {
  status: number;
  method: string;
  path: string;
}

/** Records every API call and console/page error a page makes, so tests can assert on request counts and failures. */
export function track(page: Page) {
  const calls: ApiCall[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("response", (r) => {
    const url = r.url();
    if (url.startsWith(API)) calls.push({ status: r.status(), method: r.request().method(), path: url.slice(API.length).split("?")[0]! });
  });
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  return {
    calls,
    consoleErrors,
    pageErrors,
    /** Unexpected failures: any 404 or 5xx. (401 during a session refresh and 4xx the test provokes are asserted separately.) */
    bad: () => calls.filter((c) => c.status === 404 || c.status >= 500),
    count: (pathPrefix: string) => calls.filter((c) => c.path.startsWith(pathPrefix)).length,
    duplicates: () => {
      const seen = new Map<string, number>();
      for (const c of calls.filter((c) => c.method === "GET")) seen.set(`${c.method} ${c.path}`, (seen.get(`${c.method} ${c.path}`) ?? 0) + 1);
      return [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${k} x${n}`);
    },
  };
}

/** The storage object key of a signed R2 URL: the stable identity of an image, independent of its changing signature. */
export const r2Key = (src: string | null | undefined): string => {
  if (!src) return "";
  try {
    return new URL(src).pathname;
  } catch {
    return src;
  }
};
