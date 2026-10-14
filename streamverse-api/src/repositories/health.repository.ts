import { prisma } from "../config/database";

/** Cheapest possible round trip: proves the connection and credentials work. */
export async function pingDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
