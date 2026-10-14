import { logger } from "../config/logger";
import * as authSessionRepository from "../repositories/authSession.repository";
import * as passwordResetRepository from "../repositories/passwordReset.repository";

/**
 * Deletes auth rows that can no longer be used for anything (expired, or revoked a while ago — kept
 * briefly for refresh-token-reuse detection, not forever). Safe to run repeatedly; nothing currently valid
 * is ever removed. Call this from a scheduled job/worker (Phase 1's `jobs`/`workers` folders) — Phase 2
 * only provides the function itself.
 */
const REVOKED_GRACE_DAYS = 7;

export async function cleanupExpiredAuthData(now = new Date()): Promise<{ sessions: number; resetTokens: number }> {
  const revokedBefore = new Date(now.getTime() - REVOKED_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const [sessions, resetTokens] = await Promise.all([authSessionRepository.deleteExpiredAndRevoked(now, revokedBefore), passwordResetRepository.deleteExpired(now)]);
  logger.info({ removedSessions: sessions.count, removedResetTokens: resetTokens.count }, "auth cleanup completed");
  return { sessions: sessions.count, resetTokens: resetTokens.count };
}
