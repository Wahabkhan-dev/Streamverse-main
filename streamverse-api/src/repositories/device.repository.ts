import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

type Client = Prisma.TransactionClient | typeof prisma;

export const findActiveByUserId = (userId: string) =>
  prisma.device.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { lastSeenAt: "desc" },
  });

export const findByUserIdAndIdentifier = (userId: string, deviceIdentifier: string, client: Client = prisma) =>
  client.device.findUnique({
    where: { userId_deviceIdentifier: { userId, deviceIdentifier } },
  });

export const findByIdAndUserId = (id: string, userId: string) =>
  prisma.device.findFirst({ where: { id, userId } });

export const countActive = (userId: string, client: Client = prisma) =>
  client.device.count({ where: { userId, status: "ACTIVE" } });

export const upsertDevice = (userId: string, deviceIdentifier: string, data: {
  deviceName?: string;
  deviceType?: string;
  platform?: string;
}, client: Client = prisma) =>
  client.device.upsert({
    where: { userId_deviceIdentifier: { userId, deviceIdentifier } },
    create: { userId, deviceIdentifier, ...data },
    // Re-registering reactivates a revoked device; the service has already re-checked the plan limit for it.
    update: { lastSeenAt: new Date(), status: "ACTIVE", revokedAt: null, ...data },
  });

export const revokeDevice = (id: string, userId: string) =>
  prisma.device.updateMany({
    where: { id, userId },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
