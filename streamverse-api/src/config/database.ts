import { PrismaClient } from "@prisma/client";
import { env } from "./env";

/** One client per process. Repositories import this; nothing else talks to Prisma. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: env.DATABASE_URL,
    log: env.isProduction ? ["error"] : ["warn", "error"],
  });

if (!env.isProduction) globalForPrisma.prisma = prisma;

export const disconnectDatabase = () => prisma.$disconnect();
