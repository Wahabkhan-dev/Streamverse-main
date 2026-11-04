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

    const res = await request(app).post("/api/v1/me/subscription/change-plan").set(headers).send({ planId: planB.id, consent: true });
    expect(res.status).toBe(200);
    expect(res.body.data.plan.id).toBe(planB.id);
  });

  it("an upgrade is charged immediately; a downgrade is only credited to the next invoice", async () => {
    const basic = await createTestPlan({ name: "Basic", priceAmount: 499 });
    const premium = await createTestPlan({ name: "Premium", priceAmount: 1499 });
    const { headers, stripeSub } = await userWithActiveSubscription(basic);
    fakeStripe.priceChanges.length = 0;

    await request(app).post("/api/v1/me/subscription/change-plan").set(headers).send({ planId: premium.id, consent: true });
    expect(fakeStripe.priceChanges.at(-1)).toMatchObject({ subscriptionId: stripeSub.id, chargeNow: true });

    await request(app).post("/api/v1/me/subscription/change-plan").set(headers).send({ planId: basic.id, consent: true });
    expect(fakeStripe.priceChanges.at(-1)).toMatchObject({ subscriptionId: stripeSub.id, chargeNow: false });
  });

  it("a yearly plan is compared per month: Basic monthly to a cheaper-per-month yearly plan is a downgrade", async () => {
    const monthly = await createTestPlan({ name: "Monthly", priceAmount: 1000 });
    const yearly = await createTestPlan({ name: "Yearly", priceAmount: 9000, billingInterval: "YEARLY" }); // 750 / month
    const { headers } = await userWithActiveSubscription(monthly);
    fakeStripe.priceChanges.length = 0;
    await request(app).post("/api/v1/me/subscription/change-plan").set(headers).send({ planId: yearly.id, consent: true });
    expect(fakeStripe.priceChanges.at(-1)?.chargeNow).toBe(false);
  });

  it("a declined card on an upgrade leaves the customer on the old plan with a clear message", async () => {
    const basic = await createTestPlan({ name: "Basic", priceAmount: 499 });
    const premium = await createTestPlan({ name: "Premium", priceAmount: 1499 });
    const { headers } = await userWithActiveSubscription(basic);
    fakeStripe.__declineNextCharge();

    const res = await request(app).post("/api/v1/me/subscription/change-plan").set(headers).send({ planId: premium.id, consent: true });
    expect(res.status).toBe(402);
    expect(res.body.message).toMatch(/plan was not changed/);
    const now = await request(app).get("/api/v1/me/subscription").set(headers);
    expect(now.body.data.plan.id).toBe(basic.id);
  });

  it("refuses a plan change without the customer's consent", async () => {
    const basic = await createTestPlan({ name: "Basic", priceAmount: 499 });
    const premium = await createTestPlan({ name: "Premium", priceAmount: 1499 });
    const { headers } = await userWithActiveSubscription(basic);
    fakeStripe.priceChanges.length = 0;
    for (const body of [{ planId: premium.id }, { planId: premium.id, consent: false }]) {
      const res = await request(app).post("/api/v1/me/subscription/change-plan").set(headers).send(body);
      expect(res.status).toBe(400);
    }
    expect(fakeStripe.priceChanges).toHaveLength(0); // nothing was charged or changed
  });

  it("previews an upgrade: what is charged today, the credit for the unused part, the next renewal and the saved card", async () => {
    const basic = await createTestPlan({ name: "Basic", priceAmount: 1000 });
    const premium = await createTestPlan({ name: "Premium", priceAmount: 2000 });
    const { headers } = await userWithActiveSubscription(basic);
    const res = await request(app).get(`/api/v1/me/subscription/change-plan/preview?planId=${premium.id}`).set(headers);
    expect(res.status).toBe(200);
    const p = res.body.data;
    expect(p.direction).toBe("upgrade");
    expect(p.estimate).toBe(true);
    expect(p.chargeToday).toBeGreaterThan(0);
    expect(p.chargeToday).toBeLessThanOrEqual(1000); // the difference for the rest of a period never exceeds the price gap
    expect(p.creditForUnused).toBeGreaterThan(0);
    expect(p.creditAdded).toBe(0);
    expect(p.nextRenewal.amount).toBe(2000);
    expect(p.fromPlan.name).toBe("Basic");
    expect(p.toPlan.name).toBe("Premium");
  });

  it("an upgrade uses credit the customer already has before charging the card", async () => {
    const basic = await createTestPlan({ name: "Basic", priceAmount: 1000 });
    const premium = await createTestPlan({ name: "Premium", priceAmount: 2000 });
    const { headers } = await userWithActiveSubscription(basic);
    const url = `/api/v1/me/subscription/change-plan/preview?planId=${premium.id}`;
    const without = (await request(app).get(url).set(headers)).body.data;
    expect(without.accountCredit).toBe(0);
    expect(without.creditApplied).toBe(0);

    fakeStripe.__setPendingItems([{ amount: -100 }]);
    const withCredit = (await request(app).get(url).set(headers)).body.data;
    expect(withCredit.accountCredit).toBe(100);
    expect(withCredit.creditApplied).toBe(100);
    expect(withCredit.chargeToday).toBe(without.chargeToday - 100);

    fakeStripe.__setPendingItems([{ amount: -999999 }]); // more credit than the upgrade costs: nothing is charged, and no more credit is used than is owed
    const covered = (await request(app).get(url).set(headers)).body.data;
    expect(covered.chargeToday).toBe(0);
    expect(covered.creditApplied).toBe(without.chargeToday);
  });

  it("previews a downgrade: nothing charged, a credit added", async () => {
    const basic = await createTestPlan({ name: "Basic", priceAmount: 1000 });
    const premium = await createTestPlan({ name: "Premium", priceAmount: 2000 });
    const { headers } = await userWithActiveSubscription(premium);
    const res = await request(app).get(`/api/v1/me/subscription/change-plan/preview?planId=${basic.id}`).set(headers);
    expect(res.body.data.direction).toBe("downgrade");
    expect(res.body.data.chargeToday).toBe(0);
    expect(res.body.data.creditAdded).toBeGreaterThan(0);
  });

  it("shows the customer's credit: pending items and balance netted together, never negative", async () => {
    const plan = await createTestPlan();
    const { headers } = await userWithActiveSubscription(plan);
    expect((await request(app).get("/api/v1/me/subscription/credit").set(headers)).body.data.amount).toBe(0);
    fakeStripe.__setPendingItems([{ amount: -350 }, { amount: 100 }]); // a credit and a charge that Stripe nets on the next invoice
    const res = await request(app).get("/api/v1/me/subscription/credit").set(headers);
    expect(res.body.data).toMatchObject({ amount: 250, currency: "usd" });
    fakeStripe.__setPendingItems([{ amount: 500 }]); // only a charge waiting: no credit
    expect((await request(app).get("/api/v1/me/subscription/credit").set(headers)).body.data.amount).toBe(0);
  });

  it("records the customer's consent and the figures they were shown in the audit log", async () => {
    const basic = await createTestPlan({ name: "Basic", priceAmount: 1000 });
    const premium = await createTestPlan({ name: "Premium", priceAmount: 2000 });
    const { headers } = await userWithActiveSubscription(basic);
    await request(app).post("/api/v1/me/subscription/change-plan").set(headers).send({ planId: premium.id, consent: true });
    const log = (prisma as unknown as { auditLog: { findMany: (a?: unknown) => Promise<{ action: string; metadata: { consent?: boolean; direction?: string } }[]> } }).auditLog;
    const entries = await log.findMany();
    const changed = entries.find((e) => e.action === "subscription.plan_changed");
    expect(changed?.metadata).toMatchObject({ consent: true, direction: "upgrade" });
  });

  it("refuses changing to the same plan", async () => {
    const plan = await createTestPlan();
    const { headers } = await userWithActiveSubscription(plan);
    const res = await request(app).post("/api/v1/me/subscription/change-plan").set(headers).send({ planId: plan.id, consent: true });
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
