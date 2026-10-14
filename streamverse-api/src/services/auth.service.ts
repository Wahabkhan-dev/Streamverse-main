import type { Request } from "express";
import { AppError, ConflictError, UnauthorizedError, ValidationError } from "../utils/errors";
import { ERROR_CODES } from "../constants/errors";
import { env } from "../config/env";
import { normalizeEmail } from "../utils/email";
import { sha256Hex } from "../utils/tokens";
import * as authSessionRepository from "../repositories/authSession.repository";
import * as passwordResetRepository from "../repositories/passwordReset.repository";
import * as userRepository from "../repositories/user.repository";
import { logAuthEvent } from "./authAudit.service";
import { sendPasswordReset, sendWelcomeEmail } from "./email.service";
import { hashPassword, verifyPassword } from "./password.service";
import { issuePasswordResetToken, issueRefreshToken, signAccessToken } from "./token.service";
import { serializeUser, type SafeUser } from "./user.service";
import { isRegistrationEnabled } from "./settings/appSettings.service";

const GENERIC_LOGIN_ERROR = "Invalid email or password.";

export interface AuthResult {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

const clientInfo = (req: Request) => ({ ip: req.ip, userAgent: req.get("user-agent") });

async function issueSession(userId: string, role: SafeUser["role"], req: Request): Promise<Pick<AuthResult, "accessToken" | "refreshToken" | "refreshTokenExpiresAt">> {
  const accessToken = signAccessToken({ sub: userId, role });
  const refresh = issueRefreshToken();
  await authSessionRepository.create({ userId, tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt, ...clientInfo(req) });
  return { accessToken, refreshToken: refresh.token, refreshTokenExpiresAt: refresh.expiresAt };
}

/** Public registration. Always USER, always ACTIVE — "role"/"status" are not accepted inputs anywhere above this. */
export async function register(input: { email: string; password: string; fullName: string }, req: Request): Promise<AuthResult> {
  // Phase 9: check registrationEnabled setting
  if (!(await isRegistrationEnabled())) {
    throw new AppError("Registration is currently disabled", 403, ERROR_CODES.REGISTRATION_DISABLED);
  }

  const email = normalizeEmail(input.email);
  if (await userRepository.findByEmail(email)) throw new ConflictError("An account with this email already exists.");

  const passwordHash = await hashPassword(input.password);
  const user = await userRepository.create({ email, passwordHash, fullName: input.fullName });
  logAuthEvent("register.success", req, { userId: user.id });
  await sendWelcomeEmail({ to: user.email, subject: "Welcome to StreamVerse", name: user.fullName });

  const session = await issueSession(user.id, user.role, req);
  return { user: serializeUser(user), ...session };
}

export async function login(input: { email: string; password: string }, req: Request): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const user = await userRepository.findByEmail(email);

  // Same outward response whether the account doesn't exist or the password is wrong, and whether the
  // account is suspended/deleted — no response difference reveals which case it is.
  const passwordOk = user ? await verifyPassword(user.passwordHash, input.password) : await verifyPassword(DUMMY_HASH, input.password);
  if (!user || !passwordOk || user.status !== "ACTIVE") {
    logAuthEvent("login.failure", req, { userId: user?.id });
    throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
  }

  const updated = await userRepository.touchLastLogin(user.id);
  logAuthEvent("login.success", req, { userId: user.id });

  const session = await issueSession(user.id, user.role, req);
  return { user: serializeUser(updated), ...session };
}
// A real-shaped argon2id hash with no matching password, so verifying against "no such user" costs the
// same time as a real check and reveals nothing by timing.
const DUMMY_HASH = "$argon2id$v=19$m=19456,t=2,p=1$c3RyZWFtdmVyc2VzYWx0$2N3f0q4sVZ8m4m0i4wq8qoJjvz3m4m0i4wq8qoJjvz0";

/**
 * Verifies and rotates a refresh token: the presented token is revoked and a new one issued in the same
 * call, so a token can only ever be used once. If a token that was already rotated (or logged out) is
 * presented again, that is treated as theft: every session for the user is revoked.
 */
export async function refresh(presentedToken: string, req: Request): Promise<AuthResult> {
  const session = await authSessionRepository.findByTokenHash(sha256Hex(presentedToken));
  if (!session) throw new UnauthorizedError("Invalid session. Please log in again.");

  if (session.revokedAt) {
    logAuthEvent("token.reuse_detected", req, { userId: session.userId });
    await authSessionRepository.revokeAllForUser(session.userId);
    throw new UnauthorizedError("This session is no longer valid. Please log in again.");
  }
  if (session.expiresAt < new Date()) throw new UnauthorizedError("Session expired. Please log in again.");

  const user = await userRepository.findById(session.userId);
  if (!user || user.status !== "ACTIVE") {
    await authSessionRepository.revoke(session.id);
    throw new UnauthorizedError("Invalid session. Please log in again.");
  }

  await authSessionRepository.markUsedAndRevoke(session.id);
  logAuthEvent("token.refresh", req, { userId: user.id });

  const next = await issueSession(user.id, user.role, req);
  return { user: serializeUser(user), ...next };
}

/** Revokes exactly the session the presented refresh token belongs to. Always "succeeds" from the caller's view. */
export async function logout(presentedToken: string | undefined, req: Request): Promise<void> {
  if (!presentedToken) return;
  const session = await authSessionRepository.findByTokenHash(sha256Hex(presentedToken));
  if (session && !session.revokedAt) {
    await authSessionRepository.revoke(session.id);
    logAuthEvent("logout", req, { userId: session.userId });
  }
}

export async function logoutAll(userId: string, req: Request): Promise<void> {
  await authSessionRepository.revokeAllForUser(userId);
  logAuthEvent("logout_all", req, { userId });
}

/** Always the same generic response to the caller — see the controller. This only decides whether an email is sent. */
export async function forgotPassword(email: string, req: Request): Promise<void> {
  const user = await userRepository.findByEmail(normalizeEmail(email));
  if (!user) return; // caller sees the identical generic response either way
  const reset = issuePasswordResetToken();
  await passwordResetRepository.create({ userId: user.id, tokenHash: reset.tokenHash, expiresAt: reset.expiresAt });
  logAuthEvent("password.reset_requested", req, { userId: user.id });
  await sendPasswordReset({ to: user.email, subject: "Reset your StreamVerse password", resetToken: reset.token, expiresInMinutes: env.PASSWORD_RESET_TOKEN_TTL_MINUTES });
}

export async function resetPassword(token: string, newPassword: string, req: Request): Promise<void> {
  const record = await passwordResetRepository.findByTokenHash(sha256Hex(token));
  if (!record || record.usedAt || record.expiresAt < new Date()) throw new ValidationError([{ path: "body.token", message: "This reset link is invalid or has expired." }]);

  const passwordHash = await hashPassword(newPassword);
  await Promise.all([userRepository.updatePasswordHash(record.userId, passwordHash), passwordResetRepository.markUsed(record.id), passwordResetRepository.invalidateAllForUser(record.userId), authSessionRepository.revokeAllForUser(record.userId)]);
  logAuthEvent("password.reset_success", req, { userId: record.userId });
  // No session is issued here on purpose: the person has to log in again with the new password.
}

/**
 * Chosen behavior (deliberately, not left ambiguous — Section 22): changing your password revokes EVERY
 * session, including the one making this request. The person must log in again afterwards. This is the
 * simpler and safer of the two options the spec allows, and it matches resetPassword's behavior, so the
 * two "I changed my password" paths behave the same way.
 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string, req: Request): Promise<void> {
  const user = await userRepository.findById(userId);
  if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
    logAuthEvent("password.change_failure", req, { userId });
    throw new UnauthorizedError("Current password is incorrect.");
  }
  const passwordHash = await hashPassword(newPassword);
  await Promise.all([userRepository.updatePasswordHash(userId, passwordHash), authSessionRepository.revokeAllForUser(userId)]);
  logAuthEvent("password.change_success", req, { userId });
}
