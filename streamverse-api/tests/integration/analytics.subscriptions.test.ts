import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { prisma } from "../../src/config/database";
import { getSubscriptionAnalytics } from "../../src/services/analytics/subscriptionAnalytics.service";
import { resolveRange } from "../../src/utils/dateRange";

const db = prisma as unknown as {
  __reset: () => void;
  user: { create: (a: unknown) => Promise<{ id: string }> };
  plan: { create: (a: unknown) => Promise<{ id: string }> };
  subscription: { create: (a: unknown) => Promise<unknown> };
};

beforeEach(() => db.__reset());

async function setup() {
  const u1 = await db.user.create({ data: { email: "u1@x.com", passwordHash: "x", fullName: "U1" } });
  const u2 = await db.user.create({ data: { email: "u2@x.com", passwordHash: "x", fullName: "U2" } });
  const u3 = await db.user.create({ data: { email: "u3@x.com", passwordHash: "x", fullName: "U3" } });
  const plan = await db.plan.create({ data: { name: "Premium", slug: "premium", stripePriceId: "price_p1", priceAmount: 999, currency: "usd", billingInterval: "MONTHLY" } });
  return { u1, u2, u3, plan };
}

describe("subscription analytics", () => {
  it("counts active and trialing subscriptions", async () => {
    const { u1, u2, u3, plan } = await setup();
    await db.subscription.create({ data: { userId: u1.id, planId: plan.id, stripeCustomerId: "cus1", stripeSubscriptionId: "sub1", stripePriceId: "price_p1", status: "ACTIVE" } });
    await db.subscription.create({ data: { userId: u2.id, planId: plan.id, stripeCustomerId: "cus2", stripeSubscriptionId: "sub2", stripePriceId: "price_p1", status: "TRIALING" } });
    await db.subscription.create({ data: { userId: u3.id, planId: plan.id, stripeCustomerId: "cus3", stripeSubscriptionId: "sub3", stripePriceId: "price_p1", status: "CANCELED" } });

    const range = resolveRange("30d");
    const result = await getSubscriptionAnalytics(range);

    expect(result.activeCount).toBe(1);
    expect(result.trialingCount).toBe(1);
    expect(result.canceledCount).toBe(1);
  });

  it("counts new subscriptions created in period", async () => {
    const { u1, plan } = await setup();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    await db.subscription.create({ data: { userId: u1.id, planId: plan.id, stripeCustomerId: "cus1", stripeSubscriptionId: "sub1", stripePriceId: "price_p1", status: "ACTIVE", createdAt: recentDate } });

    const range = resolveRange("30d");
    const result = await getSubscriptionAnalytics(range);
    expect(result.newInPeriod).toBe(1);
  });

  it("counts churn = subscriptions canceled within period (by canceledAt)", async () => {
    const { u1, plan } = await setup();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 3);
    await db.subscription.create({
      data: { userId: u1.id, planId: plan.id, stripeCustomerId: "cus1", stripeSubscriptionId: "sub1", stripePriceId: "price_p1", status: "CANCELED", canceledAt: recentDate },
    });

    const range = resolveRange("30d");
    const result = await getSubscriptionAnalytics(range);
    expect(result.churnInPeriod).toBe(1);
  });

  it("plan distribution only includes active/trialing subscriptions", async () => {
    const { u1, u2, plan } = await setup();
    await db.subscription.create({ data: { userId: u1.id, planId: plan.id, stripeCustomerId: "cus1", stripeSubscriptionId: "sub1", stripePriceId: "price_p1", status: "ACTIVE" } });
    await db.subscription.create({ data: { userId: u2.id, planId: plan.id, stripeCustomerId: "cus2", stripeSubscriptionId: "sub2", stripePriceId: "price_p1", status: "CANCELED" } });

    const range = resolveRange("30d");
    const result = await getSubscriptionAnalytics(range);
    const entry = result.planDistribution.find((p) => p.planId === plan.id)!;
    expect(entry.count).toBe(1); // only ACTIVE counts
    expect(entry.planName).toBe("Premium");
  });

  it("returns zero counts when no subscriptions exist", async () => {
    const range = resolveRange("30d");
    const result = await getSubscriptionAnalytics(range);
    expect(result.activeCount).toBe(0);
    expect(result.churnInPeriod).toBe(0);
  });
});
