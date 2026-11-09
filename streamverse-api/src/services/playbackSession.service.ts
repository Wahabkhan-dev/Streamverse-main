import * as playbackSessionRepository from "../repositories/playbackSession.repository";
import { streamLimitMessage } from "./entitlement/accessMessages";
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
  /** The plan read, when the caller already started it alongside its own checks (see readStreamPlan). */
  planRead?: Promise<Awaited<ReturnType<typeof subscriptionRepository.findByUserId>>>,
): Promise<{ sessionId: string }> {
  // eBooks do not occupy a stream slot. Everything else checks + inserts under a per-user lock so two
  // simultaneous starts cannot both see a free slot.
  if (contentType === "EBOOK") {
    const session = await playbackSessionRepository.createSession({ userId, contentId, contentType: contentType as string, ...(deviceId ? { deviceId } : {}) });
    return { sessionId: session.id };
  }

  // Plan read happens before the lock (a second pooled connection inside the transaction could exhaust the pool).
  const subscription = await (planRead ?? subscriptionRepository.findByUserId(userId));
  const maxStreams = subscription?.plan?.maxConcurrentStreams;

  return runLockedForUser(userId, async (tx) => {
    if (maxStreams !== null && maxStreams !== undefined) {
      const activeCount = await playbackSessionRepository.countActiveSessions(userId, tx);
      if (activeCount >= maxStreams) {
        throw new AppError(streamLimitMessage(maxStreams, subscription?.plan?.name), 403, ERROR_CODES.CONCURRENT_STREAM_LIMIT_REACHED);
      }
    }
    const session = await playbackSessionRepository.createSession({ userId, contentId, contentType: contentType as string, ...(deviceId ? { deviceId } : {}) }, tx);
    return { sessionId: session.id };
  });
}

/**
 * Starts the plan read startPlaybackSession needs, so a Play request can run it at the same time as the access checks instead
 * of after them. The stream-limit check itself still happens inside the per-user lock. Never rejects unhandled.
 */
export function readStreamPlan(userId: string) {
  const read = subscriptionRepository.findByUserId(userId);
  read.catch(() => undefined);
  return read;
}

export async function heartbeatSession(sessionId: string, userId: string): Promise<void> {
  await playbackSessionRepository.heartbeat(sessionId, userId);
}

export async function endPlaybackSession(sessionId: string, userId: string): Promise<void> {
  await playbackSessionRepository.endSession(sessionId, userId);
}
