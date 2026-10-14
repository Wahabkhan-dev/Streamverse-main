/**
 * Phase 10: rate limiting tests.
 * Verifies that a tight rate limiter returns 429 in the standard error shape,
 * and that health endpoints are not subject to the general limiter.
 */
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { createRateLimiter } from "../../src/middleware/rateLimit.middleware";

describe("Rate limiting (Phase 10)", () => {
  it("returns 429 in the standard error shape once the limit is exceeded", async () => {
    const limited = createApp({ limiter: createRateLimiter({ name: "phase10-test", windowMs: 60_000, limit: 2 }) });

    // consume the two slots
    await request(limited).get("/api/v1/phase10-missing");
    await request(limited).get("/api/v1/phase10-missing");

    // third request must be throttled
    const res = await request(limited).get("/api/v1/phase10-missing");
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ success: false, code: "RATE_LIMITED" });
  });

  it("includes rate-limit or retry-after headers when throttled", async () => {
    const limited = createApp({ limiter: createRateLimiter({ name: "phase10-retry", windowMs: 60_000, limit: 1 }) });

    await request(limited).get("/api/v1/any");
    const res = await request(limited).get("/api/v1/any");
    expect(res.status).toBe(429);
    // express-rate-limit sends at least one of: RateLimit (draft-7), X-RateLimit-*, Retry-After
    const hasRateLimitHeader =
      res.headers["ratelimit"] ??
      res.headers["ratelimit-limit"] ??
      res.headers["x-ratelimit-limit"] ??
      res.headers["retry-after"] ??
      res.headers["ratelimit-policy"];
    expect(hasRateLimitHeader).toBeDefined();
  });

  it("does not rate limit the health endpoint", async () => {
    const tight = createApp({ limiter: createRateLimiter({ name: "phase10-tight", windowMs: 60_000, limit: 1 }) });
    // health is mounted before the general limiter; hitting it many times must stay 200
    for (let i = 0; i < 5; i++) {
      expect((await request(tight).get("/health")).status).toBe(200);
    }
  });
});
