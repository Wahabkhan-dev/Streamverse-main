/**
 * Phase 8 — Subscription state access tests.
 * SUBSCRIBERS_ONLY content is accessible only when the user has ACTIVE or TRIALING subscription.
 */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});
vi.mock("../../src/services/stripe/stripe.service", () => import("../fakes/stripeService.fake.js"));

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createUser } from "../helpers/adminAuth";
import { createTestPlan } from "../helpers/billing";
import { makePublishedMovie } from "../helpers/publishedContent";
import * as fakeStripe from "../fakes/stripeService.fake";
import { applyStripeSubscriptionSnapshot } from "../../src/services/billing/subscription.service";

const db = prisma as unknown as {
  __reset: () => void;
  subscription: { update: (a: unknown) => Promise<unknown> };
};
const app = createApp();

beforeEach(() => {
  db.__reset();
  fakeStripe.__reset();
});

async function authHeaders() {
  const { accessToken } = await createUser(app);
  return { Authorization: `Bearer ${accessToken}` };
}

async function userWithSubscription(status: string, currentPeriodEnd?: Date) {
  const plan = await createTestPlan();
  const { accessToken, userId } = await createUser(app);
  const customer = fakeStripe.__createFakeCustomer(`user-${userId}@test.com`, userId);
  await (prisma as unknown as { user: { update: (a: unknown) => Promise<unknown> } }).user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });
  const stripeSub = fakeStripe.__createFakeSubscription({ customerId: customer.id, priceId: plan.stripePriceId, userId, planId: plan.id, status: "active" });
  await applyStripeSubscriptionSnapshot(stripeSub as never);
  // Override status directly for testing non-active states
  await db.subscription.update({
    where: { userId },
    data: { status, ...(currentPeriodEnd ? { currentPeriodEnd } : {}) },
  });
  return { accessToken, userId };
}

describe("SUBSCRIBERS_ONLY — subscription states", () => {
  it("no subscription: gets SUBSCRIPTION_REQUIRED, not a URL", async () => {
    const { content } = await makePublishedMovie({ visibility: "SUBSCRIBERS_ONLY" });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.access).toMatchObject({ canConsume: false, reason: "SUBSCRIPTION_REQUIRED" });
  });

  it("ACTIVE subscription: canConsume=true", async () => {
    const { content } = await makePublishedMovie({ visibility: "SUBSCRIBERS_ONLY" });
    const { accessToken } = await userWithSubscription("ACTIVE");
    const res = await request(app)
      .post(`/api/v1/media/movies/${content.id}/playback`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
  });

  it("TRIALING subscription: canConsume=true", async () => {
    const { content } = await makePublishedMovie({ visibility: "SUBSCRIBERS_ONLY" });
    const { accessToken } = await userWithSubscription("TRIALING");
    const res = await request(app)
      .post(`/api/v1/media/movies/${content.id}/playback`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
  });

  it("PAST_DUE subscription (no grace period): gets SUBSCRIPTION_INACTIVE", async () => {
    const { content } = await makePublishedMovie({ visibility: "SUBSCRIBERS_ONLY" });
    const { accessToken } = await userWithSubscription("PAST_DUE");
    const res = await request(app)
      .post(`/api/v1/media/movies/${content.id}/playback`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.access).toMatchObject({ canConsume: false, reason: "SUBSCRIPTION_INACTIVE" });
  });

  it("CANCELED subscription: gets SUBSCRIPTION_INACTIVE", async () => {
    const { content } = await makePublishedMovie({ visibility: "SUBSCRIBERS_ONLY" });
    const { accessToken } = await userWithSubscription("CANCELED");
    const res = await request(app)
      .post(`/api/v1/media/movies/${content.id}/playback`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.access).toMatchObject({ canConsume: false, reason: "SUBSCRIPTION_INACTIVE" });
  });

  it("PUBLIC content is accessible regardless of subscription status", async () => {
    const { content } = await makePublishedMovie({ visibility: "PUBLIC" });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
  });
});
