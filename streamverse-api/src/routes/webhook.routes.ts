import express, { Router } from "express";
import { handleStripeWebhook } from "../controllers/webhook.controller";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * Mounted at /api/v1/webhooks/stripe, BEFORE the app's normal `express.json()` (Section 19) — Stripe
 * signature verification needs the exact raw bytes it signed, so this route carries its OWN raw-body
 * parser and nothing upstream of it may have touched the body. Not a user-callable endpoint — it is
 * never documented alongside the customer/admin API in Swagger (Section 111), only separately.
 */
export const webhookRouter = Router();
webhookRouter.post("/stripe", express.raw({ type: "application/json", limit: "1mb" }), asyncHandler(handleStripeWebhook));
