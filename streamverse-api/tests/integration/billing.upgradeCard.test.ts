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

/** Which saved card gets charged for an upgrade: Stripe uses the subscription's own card first, then the customer's default. */
describe("the card an upgrade is charged to", () => {
  it("a saved card with nothing set to charge is made the card to charge, so the upgrade is not refused", async () => {
    const basic = await createTestPlan({ name: "Basic", priceAmount: 499 });
    const premium = await createTestPlan({ name: "Premium", priceAmount: 1499 });
    const { headers, stripeSub } = await userWithActiveSubscription(basic);
    const card = fakeStripe.__attachPaymentMethod(stripeSub.customer as string);
    expect((await fakeStripe.retrieveCustomer(stripeSub.customer as string)).invoice_settings.default_payment_method).toBeFalsy();
    expect((stripeSub as { default_payment_method?: string }).default_payment_method).toBeFalsy();

    const res = await request(app).post("/api/v1/me/subscription/change-plan").set(headers).send({ planId: premium.id, consent: true });
    expect(res.status).toBe(200);
    expect((await fakeStripe.retrieveCustomer(stripeSub.customer as string)).invoice_settings.default_payment_method).toBe(card.id);
    expect((stripeSub as { default_payment_method?: string }).default_payment_method).toBe(card.id);
  });

  it("choosing another card makes the subscription use it too (Stripe charges the subscription's own card first)", async () => {
    const basic = await createTestPlan({ name: "Basic", priceAmount: 499 });
    const { headers, stripeSub } = await userWithActiveSubscription(basic);
    const oldCard = fakeStripe.__attachPaymentMethod(stripeSub.customer as string);
    const newCard = fakeStripe.__attachPaymentMethod(stripeSub.customer as string);
    (stripeSub as { default_payment_method?: string }).default_payment_method = oldCard.id;

    const res = await request(app).post(`/api/v1/me/payment-methods/${newCard.id}/default`).set(headers);
    expect(res.status).toBe(200);
    expect((await fakeStripe.retrieveCustomer(stripeSub.customer as string)).invoice_settings.default_payment_method).toBe(newCard.id);
    expect((stripeSub as { default_payment_method?: string }).default_payment_method).toBe(newCard.id);
  });
});
