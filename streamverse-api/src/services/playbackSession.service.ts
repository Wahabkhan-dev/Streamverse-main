import * as playbackSessionRepository from "../repositories/playbackSession.repository";
import { streamLimitMessage } from "./entitlement/accessMessages";
import * as subscriptionRepository from "../repositories/subscription.repository";
import { runLockedForUser } from "../repositories/userLock.repository";
import { env } from "../config/env";
import { ERROR_CODES } from "../constants/errors";
import { AppError, NotFoundError } from "../utils/errors";
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
  // no plan at all (free titles): the free-account cap; with a plan, the plan's own limit (null there = unlimited)
  const maxStreams = subscription?.plan ? subscription.plan.maxConcurrentStreams : env.FREE_ACCOUNT_MAX_STREAMS;

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

/**
 * Keeps one of the caller's own ACTIVE sessions alive. Someone else's session, a made-up id and an ended session all get the
 * same 404, so the answer never reveals whether a session id belongs to another account.
 */
export async function heartbeatSession(sessionId: string, userId: string): Promise<void> {
  const { count } = await playbackSessionRepository.heartbeat(sessionId, userId);
  if (count === 0) throw new NotFoundError("Playback session not found or no longer active");
}

/** Ending your own session twice is fine (200); an id that is not one of your sessions is a 404. */
export async function endPlaybackSession(sessionId: string, userId: string): Promise<void> {
  const { count } = await playbackSessionRepository.endSession(sessionId, userId);
  if (count === 0 && !(await playbackSessionRepository.findOwned(sessionId, userId))) throw new NotFoundError("Playback session not found");
}
