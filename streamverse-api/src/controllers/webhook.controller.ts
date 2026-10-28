import type { Request, Response } from "express";
import { logger } from "../config/logger";
import * as stripeEventRepository from "../repositories/stripeEvent.repository";
import * as stripeService from "../services/stripe/stripe.service";
import { dispatch } from "../services/billing/stripeWebhook.service";

/**
 * Section 19/20/21/23: signature-verified against the RAW body (see `routes/webhook.routes.ts` — this
 * route is mounted with `express.raw()`, ahead of the app's normal `express.json()`), idempotent by
 * `stripeEventId`, and delegates all business logic to `stripeWebhook.service.ts` — this controller only
 * verifies, persists, dispatches, and responds.
 */
export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.get("stripe-signature");
  if (!signature) {
    res.status(400).json({ success: false, message: "Missing Stripe-Signature header" });
    return;
  }

  let event: ReturnType<typeof stripeService.constructWebhookEvent>;
  try {
    event = stripeService.constructWebhookEvent(req.body as Buffer, signature);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, "stripe webhook: signature verification failed");
    res.status(400).json({ success: false, message: "Invalid signature" });
    return;
  }

  // Section 21/63/104: a retry of an event already PROCESSED/IGNORED is acknowledged without re-dispatching
  // its side effect. FAILED events, and PENDING ones left by a crashed attempt (stale lease), are re-claimed
  // atomically so concurrent deliveries can't both process the same event.
  const claim = await stripeEventRepository.claim(event.id, event.type);
  if (claim === "done") {
    res.status(200).json({ success: true, message: "Already processed" });
    return;
  }
  if (claim === "busy") {
    // Another delivery is processing it right now; a non-2xx makes Stripe retry later (and recover if it crashes).
    res.status(409).json({ success: false, message: "Event is being processed" });
    return;
  }

  try {
    const result = await dispatch(event);
    await stripeEventRepository.setStatus(event.id, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ eventId: event.id, eventType: event.type, err: message }, "stripe webhook: handler failed");
    await stripeEventRepository.setStatus(event.id, "FAILED", message);
    // Section 63/86: a 500 here makes Stripe retry — appropriate when our own processing failed (a
    // transient DB error, say); the event row above means the retry's idempotency check still works.
    res.status(500).json({ success: false, message: "Webhook processing failed" });
    return;
  }

  res.status(200).json({ success: true, message: "Processed" });
}
