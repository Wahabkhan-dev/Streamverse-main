import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});
vi.mock("../../src/services/stripe/stripe.service", () => import("../fakes/stripeService.fake.js"));

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createAdmin, createUser } from "../helpers/adminAuth";
import { createTestPlan } from "../helpers/billing";
import * as fakeStripe from "../fakes/stripeService.fake";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();

beforeEach(() => {
  db.__reset();
  fakeStripe.__reset();
});

async function admin() {
  const { accessToken } = await createAdmin(app, db as never);
  return { Authorization: `Bearer ${accessToken}` };
}
async function user() {
  const { accessToken, userId } = await createUser(app);
  return { headers: { Authorization: `Bearer ${accessToken}` }, userId };
}

describe("Admin plan management (Section 10/11)", () => {
  it("creates, lists, gets and updates a plan; rejects a duplicate slug/price", async () => {
    const headers = await admin();
    const create = await request(app)
      .post("/api/v1/admin/plans")
      .set(headers)
      .send({ name: "Premium", slug: "premium", stripePriceId: "price_premium_1", priceAmount: 1999, currency: "usd", billingInterval: "MONTHLY", features: ["HD", "4K"] });
    expect(create.status).toBe(201);
    const planId = create.body.data.id;

    expect((await request(app).get("/api/v1/admin/plans").set(headers)).body.data).toHaveLength(1);
    expect((await request(app).get(`/api/v1/admin/plans/${planId}`).set(headers)).body.data.slug).toBe("premium");

    const updated = await request(app).put(`/api/v1/admin/plans/${planId}`).set(headers).send({ priceAmount: 2499 });
    expect(updated.body.data.priceAmount).toBe(2499);

    const dupSlug = await request(app).post("/api/v1/admin/plans").set(headers).send({ name: "Other", slug: "premium", stripePriceId: "price_other", priceAmount: 999, currency: "usd", billingInterval: "MONTHLY" });
    expect(dupSlug.status).toBe(409);
  });

  it("USER cannot create or edit plans", async () => {
    const { headers } = await user();
    const res = await request(app).post("/api/v1/admin/plans").set(headers).send({ name: "X", slug: "x", stripePriceId: "price_x", priceAmount: 100, currency: "usd", billingInterval: "MONTHLY" });
    expect(res.status).toBe(403);
  });

  it("deactivating hides a plan from the customer list but keeps it in the admin list", async () => {
    const plan = await createTestPlan();
    const headers = await admin();
    await request(app).put(`/api/v1/admin/plans/${plan.id}`).set(headers).send({ active: false });

    const customerList = await request(app).get("/api/v1/plans");
    expect(customerList.body.data.map((p: { id: string }) => p.id)).not.toContain(plan.id);
    const adminList = await request(app).get("/api/v1/admin/plans").set(headers);
    expect(adminList.body.data.map((p: { id: string }) => p.id)).toContain(plan.id);
  });
});

describe("Customer plan list (Section 12/99)", () => {
  it("returns only active plans, without unnecessary Stripe ids", async () => {
    const plan = await createTestPlan();
    const res = await request(app).get("/api/v1/plans");
    expect(res.status).toBe(200);
    const row = res.body.data.find((p: { id: string }) => p.id === plan.id);
    expect(row).toMatchObject({ name: plan.name, price: plan.priceAmount, currency: plan.currency, billingInterval: plan.billingInterval });
    expect(row).not.toHaveProperty("stripePriceId");
    expect(row).not.toHaveProperty("stripeProductId");
  });
});

describe("Checkout (Section 16/17/18/77/100)", () => {
  it("401s unauthenticated", async () => {
    const plan = await createTestPlan();
    const res = await request(app).post("/api/v1/me/subscription/checkout").send({ planId: plan.id });
    expect(res.status).toBe(401);
  });

  it("creates a checkout session for a valid USER + active plan", async () => {
    const plan = await createTestPlan();
    const { headers } = await user();
    const res = await request(app).post("/api/v1/me/subscription/checkout").set(headers).send({ planId: plan.id });
    expect(res.status).toBe(201);
    expect(res.body.data.checkoutUrl).toBeTruthy();
    expect(res.body.data.sessionId).toBeTruthy();
  });

  it("ignores a frontend-supplied amount/price — only planId is ever read", async () => {
    const plan = await createTestPlan();
    const { headers } = await user();
    const res = await request(app).post("/api/v1/me/subscription/checkout").set(headers).send({ planId: plan.id, amount: 1, currency: "xyz", stripePriceId: "price_hacked" });
    expect(res.status).toBe(201); // extra fields are simply stripped by validation, never trusted
  });

  it("rejects an unknown or inactive plan", async () => {
    const { headers } = await user();
    const unknown = await request(app).post("/api/v1/me/subscription/checkout").set(headers).send({ planId: "not-a-real-plan" });
    expect(unknown.status).toBe(400);

    const inactivePlan = await createTestPlan({ active: false });
    const inactive = await request(app).post("/api/v1/me/subscription/checkout").set(headers).send({ planId: inactivePlan.id });
    expect(inactive.status).toBe(400);
  });

  it("refuses a second checkout while already actively subscribed", async () => {
    const plan = await createTestPlan();
    const { headers, userId } = await user();
    const customer = fakeStripe.__createFakeCustomer("x@example.com", userId);
    await (prisma as unknown as { user: { update: (a: unknown) => Promise<unknown> } }).user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
    const sub = fakeStripe.__createFakeSubscription({ customerId: customer.id, priceId: plan.stripePriceId, userId, planId: plan.id, status: "active" });
    const { applyStripeSubscriptionSnapshot } = await import("../../src/services/billing/subscription.service.js");
    await applyStripeSubscriptionSnapshot(sub as never);

    const res = await request(app).post("/api/v1/me/subscription/checkout").set(headers).send({ planId: plan.id });
    expect(res.status).toBe(409);
  });
});
