import * as playbackSessionRepository from "../repositories/playbackSession.repository";
import * as subscriptionRepository from "../repositories/subscription.repository";
import { ForbiddenError } from "../utils/errors";
import type { ContentType } from "@prisma/client";

export async function startPlaybackSession(
  userId: string,
  contentId: string,
  contentType: ContentType,
  deviceId?: string,
): Promise<{ sessionId: string }> {
  if (contentType !== "EBOOK") {
    const subscription = await subscriptionRepository.findByUserId(userId);
    const maxStreams = subscription?.plan?.maxConcurrentStreams;
    if (maxStreams !== null && maxStreams !== undefined) {
      const activeCount = await playbackSessionRepository.countActiveSessions(userId);
      if (activeCount >= maxStreams) {
        throw new ForbiddenError("CONCURRENT_STREAM_LIMIT_REACHED");
      }
    }
  }

  const session = await playbackSessionRepository.createSession({
    userId,
    contentId,
    contentType: contentType as string,
    deviceId,
  });
  return { sessionId: session.id };
}

export async function heartbeatSession(sessionId: string, userId: string): Promise<void> {
  await playbackSessionRepository.heartbeat(sessionId, userId);
}

export async function endPlaybackSession(sessionId: string, userId: string): Promise<void> {
  await playbackSessionRepository.endSession(sessionId, userId);
}
