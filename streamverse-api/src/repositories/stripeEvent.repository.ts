import { prisma } from "../config/database";

export const findByStripeEventId = (stripeEventId: string) => prisma.stripeEvent.findUnique({ where: { stripeEventId } });

export const create = (data: { stripeEventId: string; type: string; status: string }) => prisma.stripeEvent.create({ data });

/** Section 21: `status` is one of PROCESSED | IGNORED | FAILED (see the model's own doc comment). */
export const setStatus = (stripeEventId: string, status: string, error: string | null = null) =>
  prisma.stripeEvent.update({ where: { stripeEventId }, data: { status, processedAt: new Date(), error } });
