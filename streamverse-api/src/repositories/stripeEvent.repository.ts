import { prisma } from "../config/database";

export const findByStripeEventId = (stripeEventId: string) => prisma.stripeEvent.findUnique({ where: { stripeEventId } });

export const create = (data: { stripeEventId: string; type: string; status: string }) => prisma.stripeEvent.create({ data });

/** Section 21: `status` is one of PROCESSED | IGNORED | FAILED (see the model's own doc comment). */
export const setStatus = (stripeEventId: string, status: string, error: string | null = null) =>
  prisma.stripeEvent.update({ where: { stripeEventId }, data: { status, processedAt: new Date(), error } });

/** A PENDING row older than this is treated as a crashed attempt whose claim can be taken over. */
export const PENDING_LEASE_MS = 5 * 60 * 1000;

export type ClaimResult = "claimed" | "busy" | "done";

/**
 * Atomically claims an event for processing. A new event is inserted PENDING; an existing FAILED event, or
 * a PENDING one whose lease went stale (crashed attempt), is re-claimed with a conditional update so only
 * one concurrent delivery wins. PROCESSED/IGNORED events are "done"; a fresh PENDING one is "busy" (another
 * delivery is mid-flight — the caller should make Stripe retry rather than acknowledge it).
 * `createdAt` doubles as the lease timestamp, refreshed on every re-claim.
 */
export async function claim(stripeEventId: string, type: string): Promise<ClaimResult> {
  try {
    await prisma.stripeEvent.create({ data: { stripeEventId, type, status: "PENDING" } });
    return "claimed";
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
  }
  const now = new Date();
  const stale = new Date(now.getTime() - PENDING_LEASE_MS);
  const { count } = await prisma.stripeEvent.updateMany({
    where: { stripeEventId, OR: [{ status: "FAILED" }, { status: "PENDING", createdAt: { lt: stale } }] },
    data: { status: "PENDING", createdAt: now, error: null },
  });
  if (count === 1) return "claimed";
  const row = await findByStripeEventId(stripeEventId);
  return row && row.status !== "PENDING" ? "done" : "busy";
}
