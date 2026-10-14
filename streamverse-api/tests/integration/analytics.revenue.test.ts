import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { prisma } from "../../src/config/database";
import { getRevenueAnalytics } from "../../src/services/analytics/revenueAnalytics.service";
import { resolveRange } from "../../src/utils/dateRange";

const db = prisma as unknown as {
  __reset: () => void;
  user: { create: (a: unknown) => Promise<{ id: string }> };
  payment: { create: (a: unknown) => Promise<{ id: string }> };
  refund: { create: (a: unknown) => Promise<unknown> };
};

beforeEach(() => db.__reset());

async function createUser(email: string) {
  return db.user.create({ data: { email, passwordHash: "x", fullName: "Test" } });
}

describe("revenue analytics", () => {
  it("calculates gross, refunded, and net for a single currency", async () => {
    const user = await createUser("u@x.com");
    const now = new Date();
    const p1 = await db.payment.create({ data: { userId: user.id, amount: 1999, currency: "usd", status: "SUCCEEDED", paidAt: now } });
    const p2 = await db.payment.create({ data: { userId: user.id, amount: 999, currency: "usd", status: "SUCCEEDED", paidAt: now } });
    void p2;
    await db.refund.create({ data: { paymentId: p1.id, amount: 500, currency: "usd", status: "SUCCEEDED" } });

    const range = resolveRange("30d");
    const result = await getRevenueAnalytics(range, "day");

    expect(result.grossRevenueCents).toBe(2998); // 1999 + 999
    expect(result.refundedCents).toBe(500);
    expect(result.netRevenueCents).toBe(2498);
    expect(result.successfulPayments).toBe(2);
  });

  it("does not mix currencies in totals (groups by currency)", async () => {
    const user = await createUser("u2@x.com");
    const now = new Date();
    await db.payment.create({ data: { userId: user.id, amount: 1000, currency: "usd", status: "SUCCEEDED", paidAt: now } });
    await db.payment.create({ data: { userId: user.id, amount: 2000, currency: "eur", status: "SUCCEEDED", paidAt: now } });

    const range = resolveRange("30d");
    const result = await getRevenueAnalytics(range, "day");

    const currencies = result.byCurrency.map((c) => c.currency);
    expect(currencies).toContain("usd");
    expect(currencies).toContain("eur");

    const usd = result.byCurrency.find((c) => c.currency === "usd")!;
    const eur = result.byCurrency.find((c) => c.currency === "eur")!;
    expect(usd.grossCents).toBe(1000);
    expect(eur.grossCents).toBe(2000);
  });

  it("counts failed payments separately", async () => {
    const user = await createUser("u3@x.com");
    const now = new Date();
    await db.payment.create({ data: { userId: user.id, amount: 0, currency: "usd", status: "FAILED", createdAt: now } });

    const range = resolveRange("30d");
    const result = await getRevenueAnalytics(range, "day");
    expect(result.failedPayments).toBe(1);
    expect(result.grossRevenueCents).toBe(0);
  });

  it("returns zero net when no payments in range", async () => {
    const range = resolveRange("7d");
    const result = await getRevenueAnalytics(range, "day");
    expect(result.grossRevenueCents).toBe(0);
    expect(result.refundedCents).toBe(0);
    expect(result.netRevenueCents).toBe(0);
  });

  it("monthly groupBy produces time series with correct bucket format", async () => {
    const range = resolveRange("this_year");
    const result = await getRevenueAnalytics(range, "month");
    // Each bucket should be YYYY-MM-01 format
    for (const point of result.timeSeries) {
      expect(point.date).toMatch(/^\d{4}-\d{2}-01$/);
    }
  });
});
