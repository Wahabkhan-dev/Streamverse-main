import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../../src/middleware/error.middleware";

/** A payment provider failure must reach the customer as a clear, actionable message, never "Something went wrong". */
function appThrowing(err: unknown) {
  const app = express();
  app.get("/x", (_req, _res, next) => next(err));
  app.use(errorHandler);
  return app;
}
const stripeErr = (type: string, extra: Record<string, unknown> = {}) => Object.assign(new Error("raw stripe text with sk_test_secret"), { type, ...extra });

describe("Stripe failures become clear responses", () => {
  it.each([
    ["StripeCardError", { code: "card_declined" }, 402, /declined/],
    ["StripeCardError", { code: "expired_card" }, 402, /expired/],
    ["StripeCardError", { code: "card_declined", decline_code: "insufficient_funds" }, 402, /insufficient funds/],
    ["StripeInvalidRequestError", { code: "subscription_payment_intent_requires_action" }, 402, /payment method/],
    ["StripeInvalidRequestError", {}, 402, /nothing was changed or charged/],
    ["StripeAPIError", {}, 503, /try again/],
    ["StripeConnectionError", {}, 503, /try again/],
    ["StripeRateLimitError", {}, 503, /try again/],
    ["StripeIdempotencyError", {}, 409, /already being processed/],
  ])("%s %j -> %i", async (type, extra, status, message) => {
    const res = await request(appThrowing(stripeErr(type, extra))).get("/x");
    expect(res.status).toBe(status);
    expect(res.body.message).toMatch(message);
    expect(res.body.message).not.toMatch(/Something went wrong/);
    expect(JSON.stringify(res.body)).not.toContain("sk_test_secret"); // Stripe's own text never leaks
  });

  it("our own Stripe misconfiguration stays a logged 500", async () => {
    const res = await request(appThrowing(stripeErr("StripeAuthenticationError"))).get("/x");
    expect(res.status).toBe(500);
  });
});
