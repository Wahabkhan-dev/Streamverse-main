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
import * as fakeStripe from "../fakes/stripeService.fake";
import { applyStripeSubscriptionSnapshot } from "../../src/services/billing/subscription.service.js";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();

beforeEach(() => {
  db.__reset();
  fakeStripe.__reset();
});

async function userWithActiveSubscription(plan: Awaited<ReturnType<typeof createTestPlan>>) {
  const { accessToken, userId } = await createUser(app);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const customer = fakeStripe.__createFakeCustomer(`${userId}@example.com`, userId);
  await (prisma as unknown as { user: { update: (a: unknown) => Promise<unknown> } }).user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  const stripeSub = fakeStripe.__createFakeSubscription({ customerId: customer.id, priceId: plan.stripePriceId, userId, planId: plan.id, status: "active" });
  await applyStripeSubscriptionSnapshot(stripeSub as never);
  return { headers, userId, stripeSub };
}

describe("GET /me/subscription (Section 27)", () => {
  it("returns a 'no subscription' shape for a user who never subscribed", async () => {
    const { accessToken } = await createUser(app);
    const res = await request(app).get("/api/v1/me/subscription").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBeNull();
    expect(res.body.data.allowedActions).toEqual(["checkout"]);
  });

  it("returns real Stripe-backed status, period dates and allowed actions for an active subscriber", async () => {
    const plan = await createTestPlan();
    const { headers } = await userWithActiveSubscription(plan);
    const res = await request(app).get("/api/v1/me/subscription").set(headers);
    expect(res.body.data.status).toBe("ACTIVE");
    expect(res.body.data.plan.id).toBe(plan.id);
    expect(res.body.data.currentPeriodEnd).toBeTruthy();
    expect(res.body.data.allowedActions).toEqual(["cancel", "changePlan"]);
  });
});

describe("Cancel / resume (Section 39/40/41/102)", () => {
  it("cancel sets cancelAtPeriodEnd rather than ending access immediately", async () => {
    const plan = await createTestPlan();
    const { headers } = await userWithActiveSubscription(plan);
    const res = await request(app).post("/api/v1/me/subscription/cancel").set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.cancelAtPeriodEnd).toBe(true);
    expect(res.body.data.status).toBe("ACTIVE"); // still active until the period actually ends
    expect(res.body.data.allowedActions).toEqual(["resume"]);
  });

  it("resume clears the cancellation flag", async () => {
    const plan = await createTestPlan();
    const { headers } = await userWithActiveSubscription(plan);
    await request(app).post("/api/v1/me/subscription/cancel").set(headers);
    const res = await request(app).post("/api/v1/me/subscription/resume").set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.cancelAtPeriodEnd).toBe(false);
  });

  it("resume is refused when not scheduled for cancellation", async () => {
    const plan = await createTestPlan();
    const { headers } = await userWithActiveSubscription(plan);
    const res = await request(app).post("/api/v1/me/subscription/resume").set(headers);
    expect(res.status).toBe(409);
  });

  it("cancel is refused for an already-canceled subscription", async () => {
    const plan = await createTestPlan();
    const { headers, stripeSub } = await userWithActiveSubscription(plan);
    fakeStripe.__setSubscriptionStatus(stripeSub.id, "canceled");
    await applyStripeSubscriptionSnapshot((await fakeStripe.retrieveSubscription(stripeSub.id)) as never);

    const res = await request(app).post("/api/v1/me/subscription/cancel").set(headers);
    expect(res.status).toBe(409);
  });
});

describe("Change plan / upgrade-downgrade (Section 42/43/44/94/102)", () => {
  it("changes to a different active plan and returns the resulting subscription", async () => {
    const planA = await createTestPlan({ name: "Basic" });
    const planB = await createTestPlan({ name: "Premium", priceAmount: 2999 });
    const { headers } = await userWithActiveSubscription(planA);

    const res = await request(app).post("/api/v1/me/subscription/change-plan").set(headers).send({ planId: planB.id });
    expect(res.status).toBe(200);
    expect(res.body.data.plan.id).toBe(planB.id);
  });

  it("refuses changing to the same plan", async () => {
    const plan = await createTestPlan();
    const { headers } = await userWithActiveSubscription(plan);
    const res = await request(app).post("/api/v1/me/subscription/change-plan").set(headers).send({ planId: plan.id });
    expect(res.status).toBe(409);
  });
});

describe("Access-state mapping (Section 15/97/102)", () => {
  it("TRIALING and ACTIVE grant access; PAST_DUE/CANCELED do not", async () => {
    const plan = await createTestPlan();
    const { userId, stripeSub } = await userWithActiveSubscription(plan);
    const { hasActiveAccess } = await import("../../src/services/billing/subscriptionAccess.service.js");

    expect(await hasActiveAccess(userId)).toBe(true); // ACTIVE

    fakeStripe.__setSubscriptionStatus(stripeSub.id, "past_due");
    await applyStripeSubscriptionSnapshot((await fakeStripe.retrieveSubscription(stripeSub.id)) as never);
    expect(await hasActiveAccess(userId)).toBe(false);

    fakeStripe.__setSubscriptionStatus(stripeSub.id, "trialing");
    await applyStripeSubscriptionSnapshot((await fakeStripe.retrieveSubscription(stripeSub.id)) as never);
    expect(await hasActiveAccess(userId)).toBe(true);

    fakeStripe.__setSubscriptionStatus(stripeSub.id, "canceled");
    await applyStripeSubscriptionSnapshot((await fakeStripe.retrieveSubscription(stripeSub.id)) as never);
    expect(await hasActiveAccess(userId)).toBe(false);
  });
});
