import { prisma } from "../config/database";

export const findActiveByUserId = (userId: string) =>
  prisma.device.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { lastSeenAt: "desc" },
  });

export const findByUserIdAndIdentifier = (userId: string, deviceIdentifier: string) =>
  prisma.device.findUnique({
    where: { userId_deviceIdentifier: { userId, deviceIdentifier } },
  });

export const findByIdAndUserId = (id: string, userId: string) =>
  prisma.device.findFirst({ where: { id, userId } });

export const countActive = (userId: string) =>
  prisma.device.count({ where: { userId, status: "ACTIVE" } });

export const upsertDevice = (userId: string, deviceIdentifier: string, data: {
  deviceName?: string;
  deviceType?: string;
  platform?: string;
}) =>
  prisma.device.upsert({
    where: { userId_deviceIdentifier: { userId, deviceIdentifier } },
    create: { userId, deviceIdentifier, ...data },
    update: { lastSeenAt: new Date(), ...data },
  });

export const revokeDevice = (id: string, userId: string) =>
  prisma.device.updateMany({
    where: { id, userId },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
