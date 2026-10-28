import * as playbackSessionRepository from "../repositories/playbackSession.repository";
import * as subscriptionRepository from "../repositories/subscription.repository";
import { runLockedForUser } from "../repositories/userLock.repository";
import { ERROR_CODES } from "../constants/errors";
import { AppError } from "../utils/errors";
import type { ContentType } from "@prisma/client";

export async function startPlaybackSession(
  userId: string,
  contentId: string,
  contentType: ContentType,
  deviceId?: string,
): Promise<{ sessionId: string }> {
  // eBooks do not occupy a stream slot. Everything else checks + inserts under a per-user lock so two
  // simultaneous starts cannot both see a free slot.
  if (contentType === "EBOOK") {
    const session = await playbackSessionRepository.createSession({ userId, contentId, contentType: contentType as string, ...(deviceId ? { deviceId } : {}) });
    return { sessionId: session.id };
  }

  // Plan read happens before the lock (a second pooled connection inside the transaction could exhaust the pool).
  const subscription = await subscriptionRepository.findByUserId(userId);
  const maxStreams = subscription?.plan?.maxConcurrentStreams;

  return runLockedForUser(userId, async (tx) => {
    if (maxStreams !== null && maxStreams !== undefined) {
      const activeCount = await playbackSessionRepository.countActiveSessions(userId, tx);
      if (activeCount >= maxStreams) {
        throw new AppError("CONCURRENT_STREAM_LIMIT_REACHED", 403, ERROR_CODES.CONCURRENT_STREAM_LIMIT_REACHED);
      }
    }
    const session = await playbackSessionRepository.createSession({ userId, contentId, contentType: contentType as string, ...(deviceId ? { deviceId } : {}) }, tx);
    return { sessionId: session.id };
  });
}

export async function heartbeatSession(sessionId: string, userId: string): Promise<void> {
  await playbackSessionRepository.heartbeat(sessionId, userId);
}

export async function endPlaybackSession(sessionId: string, userId: string): Promise<void> {
  await playbackSessionRepository.endSession(sessionId, userId);
}
