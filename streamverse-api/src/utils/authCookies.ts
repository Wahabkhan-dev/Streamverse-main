import type { Response } from "express";
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from "../constants/authCookies";
import { env } from "../config/env";

/**
 * httpOnly (JavaScript cannot read it, even on an XSS-affected page), Secure in production (HTTPS only),
 * SameSite from config (default "lax": sent on same-site requests, which covers the frontend and API
 * sharing a registrable domain — see README "Cookies & CSRF" for the cross-site case), and scoped to the
 * auth endpoints that actually need it.
 */
function cookieOptions(maxAgeMs: number) {
  return { httpOnly: true, secure: env.isProduction, sameSite: env.AUTH_COOKIE_SAMESITE, path: REFRESH_COOKIE_PATH, maxAge: maxAgeMs } as const;
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE_NAME, token, cookieOptions(Math.max(0, expiresAt.getTime() - Date.now())));
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, { httpOnly: true, secure: env.isProduction, sameSite: env.AUTH_COOKIE_SAMESITE, path: REFRESH_COOKIE_PATH });
}

export { REFRESH_COOKIE_NAME };
