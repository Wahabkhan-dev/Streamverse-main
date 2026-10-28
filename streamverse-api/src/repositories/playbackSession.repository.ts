import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

type Client = Prisma.TransactionClient | typeof prisma;

const STALE_SESSION_TIMEOUT_SECONDS = parseInt(process.env["PLAYBACK_SESSION_TIMEOUT_SECONDS"] ?? "120", 10);

export const countActiveSessions = async (userId: string, client: Client = prisma): Promise<number> => {
  const cutoff = new Date(Date.now() - STALE_SESSION_TIMEOUT_SECONDS * 1000);
  await client.playbackSession.updateMany({
    where: { userId, status: "ACTIVE", lastHeartbeatAt: { lt: cutoff } },
    data: { status: "EXPIRED" },
  });
  return client.playbackSession.count({ where: { userId, status: "ACTIVE" } });
};

export const createSession = (data: {
  userId: string;
  deviceId?: string;
  contentId: string;
  contentType: string;
}, client: Client = prisma) =>
  client.playbackSession.create({
    data: { ...data, contentType: data.contentType as any },
  });

export const heartbeat = (sessionId: string, userId: string) =>
  prisma.playbackSession.updateMany({
    where: { id: sessionId, userId, status: "ACTIVE" },
    data: { lastHeartbeatAt: new Date() },
  });

export const endSession = (sessionId: string, userId: string) =>
  prisma.playbackSession.updateMany({
    // only an ACTIVE session transitions: ending twice is a no-op and never rewrites endedAt
    where: { id: sessionId, userId, status: "ACTIVE" },
    data: { status: "ENDED", endedAt: new Date() },
  });

export const findById = (id: string) =>
  prisma.playbackSession.findUnique({ where: { id } });
