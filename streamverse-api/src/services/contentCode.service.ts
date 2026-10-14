import type { ContentType, Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import * as contentSequenceRepository from "../repositories/contentSequence.repository";

/** The only place MOV-000001 / EBK-000001 / AUD-000001 are formatted. */
export const CONTENT_CODE_PREFIX: Record<ContentType, string> = { MOVIE: "MOV", EBOOK: "EBK", AUDIOBOOK: "AUD" };
export const formatContentCode = (type: ContentType, n: number) => `${CONTENT_CODE_PREFIX[type]}-${String(n).padStart(6, "0")}`;

/**
 * The next content code for a type: never reused, even across deletions, because the counter only ever
 * goes up and a deleted title's number is never freed (Section 4). Call this inside the same database
 * transaction as the `Content` row it names — if that transaction rolls back, the increment rolls back
 * with it, so nothing is "spent" on a content record that was never actually created; nothing committed
 * ever repeats.
 */
export async function nextContentCode(type: ContentType, client: Prisma.TransactionClient | typeof prisma = prisma): Promise<string> {
  const n = await contentSequenceRepository.incrementAndGet(type, client);
  return formatContentCode(type, n);
}
