import { createPlan } from "../../src/services/billing/plan.service";

let counter = 0;

export async function createTestPlan(overrides: Record<string, unknown> = {}) {
  counter++;
  return createPlan({
    name: `Test Plan ${counter}`,
    slug: `test-plan-${counter}`,
    stripePriceId: `price_test_${counter}`,
    priceAmount: 1999,
    currency: "usd",
    billingInterval: "MONTHLY",
    features: ["HD streaming"],
    active: true,
    displayOrder: 0,
    ...overrides,
  } as never);
}
