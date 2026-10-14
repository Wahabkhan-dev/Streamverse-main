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

const db = prisma as unknown as { __reset: () => void };
const app = createApp();

beforeEach(() => {
  db.__reset();
  fakeStripe.__reset();
});

async function userWithCustomer() {
  const { accessToken, userId } = await createUser(app);
  const headers = { Authorization: `Bearer ${accessToken}` };
  // drives getOrCreateStripeCustomer the first time, same as a real billing action would
  const setup = await request(app).post("/api/v1/me/payment-methods/setup").set(headers);
  return { headers, userId, clientSecret: setup.body.data.clientSecret as string };
}

async function stripeCustomerIdFor(userId: string) {
  const row = await (prisma as unknown as { user: { findUnique: (a: unknown) => Promise<{ stripeCustomerId: string }> } }).user.findUnique({ where: { id: userId } });
  return row.stripeCustomerId;
}

describe("Setup intent + Stripe customer (Section 29/98)", () => {
  it("creates a Stripe customer on first billing action, reuses it on the second", async () => {
    const { headers, userId } = await userWithCustomer();
    const firstCustomerId = await stripeCustomerIdFor(userId);
    expect(firstCustomerId).toBeTruthy();

    await request(app).post("/api/v1/me/payment-methods/setup").set(headers);
    const secondCustomerId = await stripeCustomerIdFor(userId);
    expect(secondCustomerId).toBe(firstCustomerId); // never a second customer
  });

  it("401s unauthenticated", async () => {
    expect((await request(app).post("/api/v1/me/payment-methods/setup")).status).toBe(401);
  });
});

describe("Payment methods: list/default/delete (Section 30/31/33/34/35/101)", () => {
  it("lists methods with safe fields only, no full card data", async () => {
    const { headers, userId } = await userWithCustomer();
    const customerId = await stripeCustomerIdFor(userId);
    fakeStripe.__attachPaymentMethod(customerId, { last4: "4242" });

    const res = await request(app).get("/api/v1/me/payment-methods").set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ brand: "visa", last4: "4242", isDefault: false });
    expect(JSON.stringify(res.body)).not.toMatch(/cvc|cardNumber/i);
  });

  it("sets a default payment method", async () => {
    const { headers, userId } = await userWithCustomer();
    const customerId = await stripeCustomerIdFor(userId);
    const pm = fakeStripe.__attachPaymentMethod(customerId);

    const res = await request(app).post(`/api/v1/me/payment-methods/${pm.id}/default`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.find((m: { id: string }) => m.id === pm.id).isDefault).toBe(true);
  });

  it("deletes a non-default method freely", async () => {
    const { headers, userId } = await userWithCustomer();
    const customerId = await stripeCustomerIdFor(userId);
    const pm1 = fakeStripe.__attachPaymentMethod(customerId);
    fakeStripe.__attachPaymentMethod(customerId);
    await request(app).post(`/api/v1/me/payment-methods/${pm1.id}/default`).set(headers);
    const pm2 = (await request(app).get("/api/v1/me/payment-methods").set(headers)).body.data.find((m: { isDefault: boolean }) => !m.isDefault);

    const res = await request(app).delete(`/api/v1/me/payment-methods/${pm2.id}`).set(headers);
    expect(res.status).toBe(200);
  });

  it("blocks deleting the last/default method while an active subscription needs one (Section 35)", async () => {
    const plan = await createTestPlan();
    const { headers, userId } = await userWithCustomer();
    const customerId = await stripeCustomerIdFor(userId);
    const pm = fakeStripe.__attachPaymentMethod(customerId);
    await request(app).post(`/api/v1/me/payment-methods/${pm.id}/default`).set(headers);

    const sub = fakeStripe.__createFakeSubscription({ customerId, priceId: plan.stripePriceId, userId, planId: plan.id, status: "active" });
    const { applyStripeSubscriptionSnapshot } = await import("../../src/services/billing/subscription.service.js");
    await applyStripeSubscriptionSnapshot(sub as never);

    const res = await request(app).delete(`/api/v1/me/payment-methods/${pm.id}`).set(headers);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/add another payment method/i);
  });

  it("allows deleting the last method when there is no active subscription to protect", async () => {
    const { headers, userId } = await userWithCustomer();
    const customerId = await stripeCustomerIdFor(userId);
    const pm = fakeStripe.__attachPaymentMethod(customerId);
    await request(app).post(`/api/v1/me/payment-methods/${pm.id}/default`).set(headers);

    const res = await request(app).delete(`/api/v1/me/payment-methods/${pm.id}`).set(headers);
    expect(res.status).toBe(200);
  });

  it("USER A cannot view/default/delete USER B's payment method (Section 36/109)", async () => {
    const a = await userWithCustomer();
    const b = await userWithCustomer();
    const customerIdA = await stripeCustomerIdFor(a.userId);
    const pmA = fakeStripe.__attachPaymentMethod(customerIdA);

    const defaultAttempt = await request(app).post(`/api/v1/me/payment-methods/${pmA.id}/default`).set(b.headers);
    expect(defaultAttempt.status).toBe(403);
    const deleteAttempt = await request(app).delete(`/api/v1/me/payment-methods/${pmA.id}`).set(b.headers);
    expect(deleteAttempt.status).toBe(403);
  });
});
