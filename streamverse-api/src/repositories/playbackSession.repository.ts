import { prisma } from "../config/database";

const STALE_SESSION_TIMEOUT_SECONDS = parseInt(process.env["PLAYBACK_SESSION_TIMEOUT_SECONDS"] ?? "120", 10);

export const countActiveSessions = async (userId: string): Promise<number> => {
  const cutoff = new Date(Date.now() - STALE_SESSION_TIMEOUT_SECONDS * 1000);
  await prisma.playbackSession.updateMany({
    where: { userId, status: "ACTIVE", lastHeartbeatAt: { lt: cutoff } },
    data: { status: "EXPIRED" },
  });
  return prisma.playbackSession.count({ where: { userId, status: "ACTIVE" } });
};

export const createSession = (data: {
  userId: string;
  deviceId?: string;
  contentId: string;
  contentType: string;
}) =>
  prisma.playbackSession.create({
    data: { ...data, contentType: data.contentType as any },
  });

export const heartbeat = (sessionId: string, userId: string) =>
  prisma.playbackSession.updateMany({
    where: { id: sessionId, userId, status: "ACTIVE" },
    data: { lastHeartbeatAt: new Date() },
  });

export const endSession = (sessionId: string, userId: string) =>
  prisma.playbackSession.updateMany({
    where: { id: sessionId, userId },
    data: { status: "ENDED", endedAt: new Date() },
  });

export const findById = (id: string) =>
  prisma.playbackSession.findUnique({ where: { id } });
