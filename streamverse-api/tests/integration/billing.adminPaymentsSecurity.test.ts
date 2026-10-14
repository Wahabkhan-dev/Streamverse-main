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
import { applyStripeSubscriptionSnapshot } from "../../src/services/billing/subscription.service.js";

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

async function paidPaymentFor(plan: Awaited<ReturnType<typeof createTestPlan>>, amount = 1999) {
  const { accessToken, userId } = await createUser(app);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const customer = fakeStripe.__createFakeCustomer(`${userId}@example.com`, userId);
  await (prisma as unknown as { user: { update: (a: unknown) => Promise<unknown> } }).user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  const stripeSub = fakeStripe.__createFakeSubscription({ customerId: customer.id, priceId: plan.stripePriceId, userId, planId: plan.id, status: "active" });
  await applyStripeSubscriptionSnapshot(stripeSub as never);

  const invoice = { id: `in_${Math.random()}`, customer: customer.id, subscription: stripeSub.id, amount_paid: amount, currency: "usd", payment_intent: `pi_${Math.random()}` };
  await request(app)
    .post("/api/v1/webhooks/stripe")
    .set("Content-Type", "application/json")
    .set("Stripe-Signature", "valid-test-signature")
    .send(fakeStripe.__buildEventBody("invoice.paid", invoice).toString("utf8"));

  const payment = await (prisma as unknown as { payment: { findFirst: (a: unknown) => Promise<{ id: string }> } }).payment.findFirst({ where: { userId } });
  return { userId, headers, payment };
}

describe("Admin payments & billing history (Section 26/51/52)", () => {
  it("customer billing history returns only their own payments", async () => {
    const plan = await createTestPlan();
    const a = await paidPaymentFor(plan, 1999);
    await paidPaymentFor(plan, 2999);

    const res = await request(app).get("/api/v1/me/payments").set(a.headers);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].amount).toBe(1999);
  });

  it("admin can list and filter payments, and USER is forbidden", async () => {
    const plan = await createTestPlan();
    await paidPaymentFor(plan);
    const headers = await admin();

    const list = await request(app).get("/api/v1/admin/payments").set(headers);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);

    const byStatus = await request(app).get("/api/v1/admin/payments").query({ status: "FAILED" }).set(headers);
    expect(byStatus.body.data).toHaveLength(0);

    const { headers: userHeaders } = await createUser(app).then(async (u) => ({ headers: { Authorization: `Bearer ${u.accessToken}` } }));
    expect((await request(app).get("/api/v1/admin/payments").set(userHeaders)).status).toBe(403);
  });

  it("admin payment detail returns verified data, never fabricated", async () => {
    const plan = await createTestPlan();
    const { payment } = await paidPaymentFor(plan, 1999);
    const headers = await admin();
    const res = await request(app).get(`/api/v1/admin/payments/${payment.id}`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.amount).toBe(1999);
    expect(res.body.data.status).toBe("SUCCEEDED");
  });
});

describe("Admin payment summary (Section 53/107)", () => {
  it("derives every number from actual Payment rows — never hardcoded", async () => {
    const plan = await createTestPlan();
    await paidPaymentFor(plan, 1000);
    await paidPaymentFor(plan, 2000);

    const headers = await admin();
    const res = await request(app).get("/api/v1/admin/payments/summary").set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.succeeded).toBe(2);
    expect(res.body.data.revenueMinor).toBe(3000);
    expect(res.body.data.failed).toBe(0);
  });
});

describe("Security (Section 82/109)", () => {
  it("never returns a Stripe secret key, client secret of the wrong kind, or raw card data anywhere", async () => {
    const plan = await createTestPlan();
    const { headers } = await paidPaymentFor(plan);
    const subRes = await request(app).get("/api/v1/me/subscription").set(headers);
    const planRes = await request(app).get("/api/v1/plans");
    const combined = JSON.stringify(subRes.body) + JSON.stringify(planRes.body);
    expect(combined).not.toMatch(/sk_test_|sk_live_|whsec_|cardNumber|cvc/i);
  });

  it("the webhook endpoint cannot be bypassed without a valid signature, no matter the payload", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "forged")
      .send(JSON.stringify({ id: "evt_forged", type: "customer.subscription.deleted", data: { object: { id: "sub_forged" } } }));
    expect(res.status).toBe(400);
  });

  it("USER cannot access any admin billing endpoint", async () => {
    const { accessToken } = await createUser(app);
    const headers = { Authorization: `Bearer ${accessToken}` };
    for (const req of [
      () => request(app).get("/api/v1/admin/subscriptions").set(headers),
      () => request(app).get("/api/v1/admin/payments").set(headers),
      () => request(app).get("/api/v1/admin/payments/summary").set(headers),
      () => request(app).post("/api/v1/admin/billing/reconcile/some-user-id").set(headers),
    ]) {
      expect((await req()).status).toBe(403);
    }
  });
});
