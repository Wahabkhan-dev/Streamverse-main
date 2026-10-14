import type { Response } from "supertest";

/** Pulls one cookie's value out of a supertest response's Set-Cookie header(s). */
export function getCookie(res: Response, name: string): string | undefined {
  const raw = res.headers["set-cookie"] as unknown as string[] | string | undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    const match = new RegExp(`^${name}=([^;]+)`).exec(line);
    if (match) return decodeURIComponent(match[1]!);
  }
  return undefined;
}

export function cookieHasFlag(res: Response, name: string, flag: string): boolean {
  const raw = res.headers["set-cookie"] as unknown as string[] | string | undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const line = list.find((l) => l.startsWith(`${name}=`));
  return !!line && new RegExp(`(^|;\\s*)${flag}`, "i").test(line);
}

export function isCookieCleared(res: Response, name: string): boolean {
  const raw = res.headers["set-cookie"] as unknown as string[] | string | undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const line = list.find((l) => l.startsWith(`${name}=`));
  return !!line && (/=;/.test(line) || /Expires=Thu, 01 Jan 1970/i.test(line));
}
