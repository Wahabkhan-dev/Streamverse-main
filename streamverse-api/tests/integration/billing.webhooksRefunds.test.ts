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

async function subscribedUser(plan: Awaited<ReturnType<typeof createTestPlan>>) {
  const { accessToken, userId } = await createUser(app);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const customer = fakeStripe.__createFakeCustomer(`${userId}@example.com`, userId);
  await (prisma as unknown as { user: { update: (a: unknown) => Promise<unknown> } }).user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  const stripeSub = fakeStripe.__createFakeSubscription({ customerId: customer.id, priceId: plan.stripePriceId, userId, planId: plan.id, status: "active" });
  await applyStripeSubscriptionSnapshot(stripeSub as never);
  return { headers, userId, stripeSub, customer };
}

function postWebhook(body: Buffer, signature = "valid-test-signature") {
  // supertest/superagent would otherwise run a Buffer body through its own JSON.stringify serializer
  // (since Content-Type is application/json) — sending the UTF-8 text directly avoids that and lets the
  // exact bytes reach express.raw() server-side, same as a real Stripe webhook delivery would.
  return request(app).post("/api/v1/webhooks/stripe").set("Content-Type", "application/json").set("Stripe-Signature", signature).send(body.toString("utf8"));
}

describe("Webhook signature (Section 103)", () => {
  it("rejects a missing signature", async () => {
    const res = await request(app).post("/api/v1/webhooks/stripe").set("Content-Type", "application/json").send(Buffer.from("{}"));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid signature", async () => {
    const body = fakeStripe.__buildEventBody("invoice.paid", {});
    const res = await postWebhook(body, "wrong-signature");
    expect(res.status).toBe(400);
  });

  it("accepts a valid signature", async () => {
    const body = fakeStripe.__buildEventBody("setup_intent.succeeded", {});
    const res = await postWebhook(body);
    expect(res.status).toBe(200);
  });
});

describe("Invoice events (Section 65/66/105)", () => {
  it("invoice.paid creates a SUCCEEDED Payment", async () => {
    const plan = await createTestPlan();
    const { userId, stripeSub, customer } = await subscribedUser(plan);

    const invoice = { id: "in_test_1", customer: customer.id, subscription: stripeSub.id, amount_paid: 1999, currency: "usd", payment_intent: "pi_test_1" };
    const res = await postWebhook(fakeStripe.__buildEventBody("invoice.paid", invoice));
    expect(res.status).toBe(200);

    const payments = await (prisma as unknown as { payment: { findMany: (a: unknown) => Promise<{ status: string; userId: string; amount: number }[]> } }).payment.findMany({ where: { userId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ status: "SUCCEEDED", amount: 1999 });
  });

  it("a duplicate invoice.paid event does not create a second Payment (Section 104/105)", async () => {
    const plan = await createTestPlan();
    const { userId, stripeSub, customer } = await subscribedUser(plan);
    const invoice = { id: "in_test_2", customer: customer.id, subscription: stripeSub.id, amount_paid: 1999, currency: "usd", payment_intent: "pi_test_2" };

    await postWebhook(fakeStripe.__buildEventBody("invoice.paid", invoice));
    await postWebhook(fakeStripe.__buildEventBody("invoice.paid", invoice)); // Stripe retry: same event body, new event id from the fake builder is fine — it's the invoice id that matters

    const payments = await (prisma as unknown as { payment: { findMany: (a: unknown) => Promise<unknown[]> } }).payment.findMany({ where: { userId } });
    expect(payments).toHaveLength(1);
  });

  it("the SAME Stripe event id is only ever dispatched once (Section 21/104)", async () => {
    const plan = await createTestPlan();
    const { userId, stripeSub, customer } = await subscribedUser(plan);
    const invoice = { id: "in_test_3", customer: customer.id, subscription: stripeSub.id, amount_paid: 1999, currency: "usd", payment_intent: "pi_test_3" };
    const body = fakeStripe.__buildEventBody("invoice.paid", invoice);

    await postWebhook(body);
    await postWebhook(body); // byte-identical retry of the exact same event id

    const payments = await (prisma as unknown as { payment: { findMany: (a: unknown) => Promise<unknown[]> } }).payment.findMany({ where: { userId } });
    expect(payments).toHaveLength(1);
  });

  it("invoice.payment_failed records a FAILED payment", async () => {
    const plan = await createTestPlan();
    const { userId, stripeSub, customer } = await subscribedUser(plan);
    const invoice = { id: "in_test_4", customer: customer.id, subscription: stripeSub.id, amount_due: 1999, currency: "usd" };

    const res = await postWebhook(fakeStripe.__buildEventBody("invoice.payment_failed", invoice));
    expect(res.status).toBe(200);
    const payments = await (prisma as unknown as { payment: { findMany: (a: unknown) => Promise<{ status: string }[]> } }).payment.findMany({ where: { userId } });
    expect(payments[0]!.status).toBe("FAILED");
  });
});

describe("Refunds (Section 54-57/106, admin-only)", () => {
  async function paidPayment(plan: Awaited<ReturnType<typeof createTestPlan>>) {
    const subscribed = await subscribedUser(plan);
    const invoice = { id: `in_${Math.random()}`, customer: subscribed.customer.id, subscription: subscribed.stripeSub.id, amount_paid: 2000, currency: "usd", payment_intent: `pi_${Math.random()}` };
    await postWebhook(fakeStripe.__buildEventBody("invoice.paid", invoice));
    const payment = await (prisma as unknown as { payment: { findFirst: (a: unknown) => Promise<{ id: string }> } }).payment.findFirst({ where: { userId: subscribed.userId } });
    return { ...subscribed, payment };
  }

  it("USER cannot call the refund endpoint", async () => {
    const plan = await createTestPlan();
    const { payment, headers } = await paidPayment(plan);
    const res = await request(app).post(`/api/v1/admin/payments/${payment.id}/refund`).set(headers).send({});
    expect(res.status).toBe(403);
  });

  it("full refund (amount omitted) refunds the entire payment", async () => {
    const plan = await createTestPlan();
    const { payment } = await paidPayment(plan);
    const headers = await admin();
    const res = await request(app).post(`/api/v1/admin/payments/${payment.id}/refund`).set(headers).send({});
    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(2000);
    expect(res.body.data.status).toBe("SUCCEEDED");

    const updated = await (prisma as unknown as { payment: { findUnique: (a: unknown) => Promise<{ status: string }> } }).payment.findUnique({ where: { id: payment.id } });
    expect(updated!.status).toBe("REFUNDED");
  });

  it("partial refund marks the payment PARTIALLY_REFUNDED", async () => {
    const plan = await createTestPlan();
    const { payment } = await paidPayment(plan);
    const headers = await admin();
    const res = await request(app).post(`/api/v1/admin/payments/${payment.id}/refund`).set(headers).send({ amount: 500 });
    expect(res.status).toBe(201);

    const updated = await (prisma as unknown as { payment: { findUnique: (a: unknown) => Promise<{ status: string }> } }).payment.findUnique({ where: { id: payment.id } });
    expect(updated!.status).toBe("PARTIALLY_REFUNDED");
  });

  it("rejects a refund that exceeds the remaining refundable amount (over-refund)", async () => {
    const plan = await createTestPlan();
    const { payment } = await paidPayment(plan);
    const headers = await admin();
    await request(app).post(`/api/v1/admin/payments/${payment.id}/refund`).set(headers).send({ amount: 1500 });

    const overRefund = await request(app).post(`/api/v1/admin/payments/${payment.id}/refund`).set(headers).send({ amount: 1000 }); // only 500 remains
    expect(overRefund.status).toBe(400);
  });

  it("protects against a duplicate refund of an already-fully-refunded payment", async () => {
    const plan = await createTestPlan();
    const { payment } = await paidPayment(plan);
    const headers = await admin();
    await request(app).post(`/api/v1/admin/payments/${payment.id}/refund`).set(headers).send({});
    const again = await request(app).post(`/api/v1/admin/payments/${payment.id}/refund`).set(headers).send({});
    expect(again.status).toBe(409);
  });

  it("rejects refunding a payment that never succeeded", async () => {
    const plan = await createTestPlan();
    const { userId, stripeSub, customer } = await subscribedUser(plan);
    const invoice = { id: "in_failed", customer: customer.id, subscription: stripeSub.id, amount_due: 2000, currency: "usd" };
    await postWebhook(fakeStripe.__buildEventBody("invoice.payment_failed", invoice));
    const failedPayment = await (prisma as unknown as { payment: { findFirst: (a: unknown) => Promise<{ id: string }> } }).payment.findFirst({ where: { userId } });

    const headers = await admin();
    const res = await request(app).post(`/api/v1/admin/payments/${failedPayment.id}/refund`).set(headers).send({});
    expect(res.status).toBe(409);
  });
});
