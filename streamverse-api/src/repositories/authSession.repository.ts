import type { AuthSession } from "@prisma/client";
import { prisma } from "../config/database";

export type { AuthSession };

export interface CreateSessionInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export const create = (data: CreateSessionInput): Promise<AuthSession> => prisma.authSession.create({ data });

/** Looked up by the hash of the token the client presented — the raw token is never stored, so never queried for. */
export const findByTokenHash = (tokenHash: string): Promise<AuthSession | null> => prisma.authSession.findUnique({ where: { tokenHash } });

export const markUsed = (id: string): Promise<AuthSession> => prisma.authSession.update({ where: { id }, data: { lastUsedAt: new Date() } });

export const revoke = (id: string): Promise<AuthSession> => prisma.authSession.update({ where: { id }, data: { revokedAt: new Date() } });

/** Rotation: one statement that both marks the token used and revokes it, instead of two racing updates. */
export const markUsedAndRevoke = (id: string): Promise<AuthSession> => prisma.authSession.update({ where: { id }, data: { lastUsedAt: new Date(), revokedAt: new Date() } });

/** Used on logout-all, password reset and password change: every other (or every) session for the user stops working. */
export const revokeAllForUser = (userId: string): Promise<{ count: number }> => prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

/**
 * Housekeeping only (Section 41): rows that can no longer be used for anything.
 * `revokedBefore` should be well in the past of `expiredBefore` — a just-revoked row (rotated out a
 * second ago) is kept for a while on purpose, so a reused, already-rotated token can still be detected.
 */
export const deleteExpiredAndRevoked = (expiredBefore: Date, revokedBefore: Date): Promise<{ count: number }> =>
  prisma.authSession.deleteMany({ where: { OR: [{ expiresAt: { lt: expiredBefore } }, { revokedAt: { lt: revokedBefore } }] } });

/**
 * Atomically claims a still-active session for rotation: the conditional update succeeds for exactly one
 * of any number of concurrent callers. Returns false if someone else already revoked/rotated it.
 */
export const claimForRotation = async (id: string): Promise<boolean> => {
  const now = new Date();
  const { count } = await prisma.authSession.updateMany({ where: { id, revokedAt: null }, data: { lastUsedAt: now, revokedAt: now } });
  return count === 1;
};
