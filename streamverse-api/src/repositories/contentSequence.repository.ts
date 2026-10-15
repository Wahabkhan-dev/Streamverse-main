import type { ContentType, Prisma } from "@prisma/client";
import { prisma } from "../config/database";

/**
 * Atomically bumps the counter for one content type and returns the new value. Backed by a single
 * MySQL `INSERT ... ON DUPLICATE KEY UPDATE lastValue = lastValue + 1` (what Prisma compiles
 * `upsert` with an `increment` to) — one statement, so two concurrent callers can never read the same
 * value: MySQL/InnoDB serializes the two statements via the row's lock, and each gets a distinct result.
 * Pass the enclosing transaction's client (`tx`) when this is part of a bigger content-creation write, so
 * a rollback there rolls this back too (see content.service.ts).
 */
export async function incrementAndGet(type: ContentType, client: Prisma.TransactionClient | typeof prisma = prisma): Promise<number> {
  const row = await client.contentSequence.upsert({
    where: { type },
    create: { type, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });
  return row.lastValue;
}
