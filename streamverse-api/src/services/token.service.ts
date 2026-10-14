import jwt from "jsonwebtoken";
import type { Role } from "../constants/roles";
import { env } from "../config/env";
import { randomToken, sha256Hex } from "../utils/tokens";

const ISSUER = "streamverse-api";
const AUDIENCE = "streamverse-frontend";

/** What an access token carries. Deliberately minimal — never full profile data. */
export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

/** Signs a short-lived access token. Only `sub` and `role` ride in the payload. */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { issuer: ISSUER, audience: AUDIENCE, expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"] });
}

/** Verifies issuer, audience, expiry and signature. Throws (jsonwebtoken's errors) on any mismatch. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER, audience: AUDIENCE });
  if (typeof decoded === "string" || typeof decoded["sub"] !== "string" || typeof decoded["role"] !== "string") {
    throw new jwt.JsonWebTokenError("Malformed token payload");
  }
  return { sub: decoded["sub"], role: decoded["role"] as Role };
}

export interface IssuedOpaqueToken {
  /** the raw value: sent to the client once, never stored */
  token: string;
  /** sha256(token): what is stored, so the raw value never sits in the database */
  tokenHash: string;
  expiresAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A refresh token: random, opaque, unguessable. Looked up later by hashing the value the client presents. */
export function issueRefreshToken(): IssuedOpaqueToken {
  const token = randomToken(48);
  return { token, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS) };
}

/** A password reset token: same shape, shorter lifetime. */
export function issuePasswordResetToken(): IssuedOpaqueToken {
  const token = randomToken(32);
  return { token, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60_000) };
}

export { sha256Hex };
