/**
 * Phase 8: minimal repository for the entitlement service.
 * Fetches the Content row with territories — exactly what `checkAccess` needs to evaluate every rule.
 * Uses `include` (not `select`) so the query works identically against the real Prisma client and the
 * in-memory `fakePrisma.ts` used by integration tests (which only supports `include`, not `select`).
 */
import { prisma } from "../config/database";

export const findContentForEntitlement = (contentId: string) =>
  prisma.content.findUnique({
    where: { id: contentId },
    include: { territories: true },
  });

export type EntitlementContent = NonNullable<Awaited<ReturnType<typeof findContentForEntitlement>>>;
