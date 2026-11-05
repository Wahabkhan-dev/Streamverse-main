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

async function subscriber(plan: Awaited<ReturnType<typeof createTestPlan>>) {
  const { accessToken, userId } = await createUser(app);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const customer = fakeStripe.__createFakeCustomer(`${userId}@example.com`, userId);
  await (prisma as unknown as { user: { update: (a: unknown) => Promise<unknown> } }).user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  const stripeSub = fakeStripe.__createFakeSubscription({ customerId: customer.id, priceId: plan.stripePriceId, userId, planId: plan.id, status: "active" });
  await applyStripeSubscriptionSnapshot(stripeSub as never);
  return { headers, userId, stripeSub };
}

/** What an admin price edit does when Stripe is connected: the plan gets a NEW Stripe price; people already subscribed keep the old one. */
async function editPlanPrice(planId: string, newPriceId: string, newAmount: number) {
  await (prisma as unknown as { plan: { update: (a: unknown) => Promise<unknown> } }).plan.update({ where: { id: planId }, data: { stripePriceId: newPriceId, priceAmount: newAmount } });
}

describe("after an admin edits a plan's price", () => {
  it("people already on the old price keep syncing from Stripe (cancel, failed payment, renewal) instead of erroring", async () => {
    const basic = await createTestPlan({ name: "Basic", priceAmount: 499 });
    const { headers, userId, stripeSub } = await subscriber(basic);
    await editPlanPrice(basic.id, "price_NEW_after_edit", 699);

    // Stripe reports the renewal failed: the subscription still carries the OLD price, which no plan points to any more
    fakeStripe.__setSubscriptionStatus(stripeSub.id, "past_due");
    await expect(applyStripeSubscriptionSnapshot((await fakeStripe.retrieveSubscription(stripeSub.id)) as never)).resolves.toBeUndefined();

    const mine = await request(app).get("/api/v1/me/subscription").set(headers);
    expect(mine.body.data.status).toBe("PAST_DUE"); // the new status was recorded
    expect(mine.body.data.plan.id).toBe(basic.id); // and they are still on their plan
    expect(userId).toBeTruthy();
  });

  it("the cost preview credits what the customer actually pays, not the plan's new price", async () => {
    const basic = await createTestPlan({ name: "Basic", priceAmount: 499 });
    const standard = await createTestPlan({ name: "Standard", priceAmount: 1499 });
    const { headers, stripeSub } = await subscriber(basic);
    // they pay $4.99 (their Stripe price), but the plan now costs $9.99 for new subscribers
    (stripeSub as { items: { data: { price: unknown }[] } }).items.data[0]!.price = { id: basic.stripePriceId, unit_amount: 499, recurring: { interval: "month" } };
    await editPlanPrice(basic.id, "price_NEW_after_edit", 999);

    const res = await request(app).get(`/api/v1/me/subscription/change-plan/preview?planId=${standard.id}`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.fromPlan.priceAmount).toBe(499);
    expect(res.body.data.creditForUnused).toBeLessThanOrEqual(499);
    expect(res.body.data.creditForUnused).toBeGreaterThan(0);
  });

  it("a plan whose price was raised above another is still judged an upgrade or downgrade by what they pay", async () => {
    const basic = await createTestPlan({ name: "Basic", priceAmount: 499 });
    const standard = await createTestPlan({ name: "Standard", priceAmount: 799 });
    const { headers, stripeSub } = await subscriber(basic);
    (stripeSub as { items: { data: { price: unknown }[] } }).items.data[0]!.price = { id: basic.stripePriceId, unit_amount: 499, recurring: { interval: "month" } };
    await editPlanPrice(basic.id, "price_NEW_after_edit", 999); // Basic now costs more than Standard for new people

    // for this customer (paying $4.99) Standard at $7.99 is still an upgrade
    const res = await request(app).get(`/api/v1/me/subscription/change-plan/preview?planId=${standard.id}`).set(headers);
    expect(res.body.data.direction).toBe("upgrade");
    fakeStripe.priceChanges.length = 0;
    const done = await request(app).post("/api/v1/me/subscription/change-plan").set(headers).send({ planId: standard.id, consent: true });
    expect(done.status).toBe(200);
    expect(fakeStripe.priceChanges.at(-1)?.chargeNow).toBe(true);
  });
});
