import type { PasswordResetToken } from "@prisma/client";
import { prisma } from "../config/database";

export type { PasswordResetToken };

export const create = (data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<PasswordResetToken> => prisma.passwordResetToken.create({ data });

export const findByTokenHash = (tokenHash: string): Promise<PasswordResetToken | null> => prisma.passwordResetToken.findUnique({ where: { tokenHash } });

export const markUsed = (id: string): Promise<PasswordResetToken> => prisma.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } });

/** A reset invalidates any reset request still outstanding for the same user. */
export const invalidateAllForUser = (userId: string): Promise<{ count: number }> =>
  prisma.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });

/** Housekeeping only (Section 41). */
export const deleteExpired = (olderThan: Date): Promise<{ count: number }> => prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: olderThan } } });

/**
 * Changes the password, consumes the reset token and revokes all sessions in one transaction. The token is
 * claimed with a conditional update, so of two concurrent submissions only one wins. Returns false if the
 * token was already used or expired.
 */
export const consumeAndSetPassword = (id: string, userId: string, passwordHash: string): Promise<boolean> =>
  prisma.$transaction(async (tx) => {
    const now = new Date();
    const claimed = await tx.passwordResetToken.updateMany({ where: { id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
    await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    return true;
  });
