import type { Request, Response } from "express";
import { prisma } from "../config/database";
import { sendSuccess } from "../utils/apiResponse";

/**
 * POST /api/v1/newsletter/subscribe  { email }  — public.
 * The answer is the same whether the address was new or already signed up, so nobody can use this to find out who subscribed.
 */
export async function subscribe(req: Request, res: Response) {
  const { email } = req.body as { email: string };
  await prisma.newsletterSubscriber.upsert({ where: { email }, create: { email }, update: {} });
  sendSuccess(res, { subscribed: true }, "You're on the list");
}
