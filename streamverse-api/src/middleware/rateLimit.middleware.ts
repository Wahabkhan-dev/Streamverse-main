import type { Request, RequestHandler } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { env } from "../config/env";
import { verifyAccessToken } from "../services/token.service";
import { normalizeEmail } from "../utils/email";
import { ERROR_CODES } from "../constants/errors";
import { sendError } from "../utils/apiResponse";

interface Policy {
  /** shown in logs and in the Retry-After message */
  name: string;
  windowMs: number;
  limit: number;
}

const MINUTE = 60_000;

/** One policy per kind of traffic. Phase 1 applies `general`; the others are wired to their routes in later phases. */
export const RATE_POLICIES = {
  general: { name: "general", windowMs: 15 * MINUTE, limit: 300 },
  login: { name: "login", windowMs: 15 * MINUTE, limit: 10 },
  passwordReset: { name: "password-reset", windowMs: 60 * MINUTE, limit: 5 },
  refresh: { name: "refresh", windowMs: 15 * MINUTE, limit: 30 },
  search: { name: "search", windowMs: MINUTE, limit: 60 },
  uploadAuthorization: { name: "upload-authorization", windowMs: MINUTE, limit: 30 },
  // Phase 7 (Section 83): billing actions that would otherwise let a script spam thousands of Stripe objects.
  billingWrite: { name: "billing-write", windowMs: MINUTE, limit: 10 },
  register: { name: "register", windowMs: 60 * MINUTE, limit: 20 },
  newsletter: { name: "newsletter", windowMs: 60 * MINUTE, limit: 10 },
} as const satisfies Record<string, Policy>;

/** Builds a limiter keyed by client IP (the app sets `trust proxy` so this is the real client behind a proxy). */
export function createRateLimiter(policy: Policy, keyBy?: (req: Request) => string): RequestHandler {
  return rateLimit({
    windowMs: policy.windowMs,
    limit: policy.limit * env.RATE_LIMIT_MULTIPLIER,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    ...(keyBy ? { keyGenerator: (req) => keyBy(req as Request) } : {}),
    handler: (req, res) => {
      sendError(res, 429, "Too many requests. Please try again later.", [], { code: ERROR_CODES.RATE_LIMITED, requestId: (req as Request).id });
    },
  });
}

/**
 * Signed-in visitors get a bucket each: thousands of real people can share one address (mobile networks, offices, the host's
 * own proxies), and one shared bucket would lock them all out together. Anyone else is keyed by address. Only the token's
 * signature is checked here (no database work); a bad or expired token falls back to the address.
 */
const visitorKey = (req: Request) => {
  const match = /^Bearer (.+)$/.exec(req.get("authorization") ?? "");
  if (match) {
    try {
      return `user:${verifyAccessToken(match[1]!).sub}`;
    } catch {
      /* keyed by address */
    }
  }
  return ipKeyGenerator(req.ip ?? "");
};

export const generalLimiter = () => createRateLimiter(RATE_POLICIES.general, visitorKey);
// Keyed by email+IP, not IP alone: one person mistyping a password repeatedly doesn't lock out everyone
// on the same NAT/office network, but still can't be brute-forced against a single account from many IPs.
/** IP + normalized email, so case/whitespace variants of one address share a bucket. */
const emailKey = (req: Request) => `${req.ip}:${normalizeEmail(String((req.body as { email?: string })?.email ?? ""))}`;

export const loginLimiter = () => createRateLimiter(RATE_POLICIES.login, (req) => emailKey(req));
export const forgotPasswordLimiter = () => createRateLimiter(RATE_POLICIES.passwordReset, (req) => emailKey(req));
// reset-password has no email in its body (only a token) — keyed by the token itself, so brute-forcing
// one token is limited without one shared bucket collapsing every unrelated reset in the same window.
export const resetPasswordLimiter = () => createRateLimiter(RATE_POLICIES.passwordReset, (req) => `${req.ip}:${String((req.body as { token?: string })?.token ?? "")}`);
export const newsletterLimiter = () => createRateLimiter(RATE_POLICIES.newsletter);
export const refreshLimiter = () => createRateLimiter(RATE_POLICIES.refresh);
export const searchLimiter = () => createRateLimiter(RATE_POLICIES.search, visitorKey);
export const uploadAuthorizationLimiter = () => createRateLimiter(RATE_POLICIES.uploadAuthorization);
export const billingWriteLimiter = () => createRateLimiter(RATE_POLICIES.billingWrite);
export const registerLimiter = () => createRateLimiter(RATE_POLICIES.register);
