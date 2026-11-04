import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The live site runs with VITE_DEMO_MODE=false: the page reads the real API, never the browser's demo store.
vi.hoisted(() => {
  (import.meta.env as Record<string, string>)["VITE_DEMO_MODE"] = "false";
});

import { setAuthUser } from "@/lib/authState";
import { getStoreState } from "@/lib/store";
import type { ApiUser } from "@/api/types";
import { renderAt, resetAll } from "./utils";

const user = { id: "u1", email: "t@example.com", fullName: "Test User", avatarUrl: null, role: "user", status: "ACTIVE", emailVerified: true, preferences: { country: null, preferredLanguage: null, subtitleLanguage: null, audioLanguage: null, videoQuality: null, audiobookSpeed: null }, createdAt: "2026-11-01T00:00:00.000Z" } as unknown as ApiUser;

const plan = { id: "p1", name: "Basic", slug: "basic", description: "d", price: 499, priceAmount: 499, currency: "usd", billingInterval: "MONTHLY", trialDays: null, features: [], maxDevices: 1, maxConcurrentStreams: 1, maxVideoQuality: "720p", moviesEnabled: true, ebooksEnabled: true, audiobooksEnabled: false };

/** What GET /me/subscription really returns, copied from the live API. */
const states = {
  none: { plan: null, status: null, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, canceledAt: null, trialEnd: null, defaultPaymentMethod: null, allowedActions: ["checkout"] },
  incomplete: { plan, status: "INCOMPLETE", currentPeriodStart: "2026-11-04T00:26:03.000Z", currentPeriodEnd: "2026-12-04T00:26:03.000Z", cancelAtPeriodEnd: false, canceledAt: null, trialEnd: null, defaultPaymentMethod: null, allowedActions: ["checkout"] },
  active: { plan, status: "ACTIVE", currentPeriodStart: "2026-11-04T00:26:03.000Z", currentPeriodEnd: "2026-12-04T00:26:03.000Z", cancelAtPeriodEnd: false, canceledAt: null, trialEnd: null, defaultPaymentMethod: { id: "pm1", brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 }, allowedActions: ["cancel", "change_plan"] },
};

/** What GET /me/payments really returns once a customer has paid: the plan is an object and the status is in capitals. */
const paid = [{ id: "pay1", date: "2026-11-04T00:28:45.000Z", amount: 499, currency: "usd", status: "SUCCEEDED", plan: { id: "p1", name: "Basic" }, invoiceReference: "in_123", refunded: false }];

/** What the live API returns for a plan-change preview (cents). */
const previews = {
  upgrade: { direction: "upgrade", estimate: true, currency: "usd", fromPlan: { id: "p2", name: "Standard", priceAmount: 999, currency: "usd", billingInterval: "MONTHLY" }, toPlan: { id: "p3", name: "Premium", priceAmount: 1499, currency: "usd", billingInterval: "MONTHLY" }, periodEnd: "2026-12-04T00:00:00.000Z", daysLeft: 20, creditForUnused: 660, newPlanForRest: 990, chargeToday: 330, creditAdded: 0, nextRenewal: { date: "2026-12-04T00:00:00.000Z", amount: 1499 }, paymentMethod: { brand: "visa", last4: "4242" } },
  downgrade: { direction: "downgrade", estimate: true, currency: "usd", fromPlan: { id: "p2", name: "Standard", priceAmount: 999, currency: "usd", billingInterval: "MONTHLY" }, toPlan: { id: "p1", name: "Basic", priceAmount: 499, currency: "usd", billingInterval: "MONTHLY" }, periodEnd: "2026-12-04T00:00:00.000Z", daysLeft: 20, creditForUnused: 660, newPlanForRest: 330, chargeToday: 0, creditAdded: 330, nextRenewal: { date: "2026-12-04T00:00:00.000Z", amount: 499 }, paymentMethod: { brand: "visa", last4: "4242" } },
};
const card = { id: "pm1", brand: "visa", last4: "4242", expMonth: 12, expYear: 2030, isDefault: true };

function serve(sub: unknown, payments: unknown[] = [], plans: unknown[] = [plan], extra: { preview?: unknown; credit?: number; cards?: unknown[] } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const body = u.includes("/settings/public")
        ? { data: { maintenanceMode: false, ageGateEnabled: true, autoplayNext: false, autoplayPreview: false } }
        : u.includes("/change-plan/preview")
        ? { data: extra.preview ?? null }
        : u.includes("/subscription/credit")
          ? { data: { amount: extra.credit ?? 0, currency: "usd" } }
          : u.includes("/me/subscription")
            ? { data: sub }
            : u.includes("/me/payments")
              ? { data: payments, pagination: {} }
              : u.includes("/me/payment-methods")
                ? { data: extra.cards ?? [] }
                : u.includes("/plans")
                  ? { data: plans }
                  : { data: null };
      return new Response(JSON.stringify({ success: true, message: "ok", ...body }), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
}

beforeEach(() => {
  resetAll("user");
  setAuthUser(user);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const callsTo = (part: string) => (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) => String(c[0]).includes(part));
const postsTo = (part: string) => callsTo(part).filter((c) => (c[1] as { method?: string } | undefined)?.method === "POST");

describe("Subscription page states and settings (live)", () => {
  it("a scheduled cancellation shows 'cancelled, access until' with Resume (the server keeps the status ACTIVE until the period ends)", async () => {
    serve({ ...states.active, cancelAtPeriodEnd: true });
    renderAt("/subscription");
    expect(await screen.findByText(/Your plan is cancelled/, {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText("Resume plan")).toBeTruthy();
  });

  it("an ended subscription offers to renew with a fresh payment link, not a dead-end button", async () => {
    serve({ ...states.active, status: "CANCELED", allowedActions: ["checkout"] });
    renderAt("/subscription");
    expect(await screen.findByText("Renew your plan", {}, { timeout: 5000 })).toBeTruthy();
    expect(await screen.findByText("Renew Basic")).toBeTruthy();
    expect(screen.getByText(/Your plan has ended/)).toBeTruthy();
  });

  it("Retry payment on a failed renewal really calls the server", async () => {
    serve({ ...states.active, status: "PAST_DUE" });
    renderAt("/subscription");
    fireEvent.click(await screen.findByText("Retry payment", {}, { timeout: 5000 }));
    await waitFor(() => expect(postsTo("/me/subscription/retry-payment")).toHaveLength(1));
  });

  it("the admin's age-gate and autoplay settings reach a customer's browser", async () => {
    serve(states.active);
    renderAt("/subscription");
    await waitFor(() => expect(getStoreState().settings).toMatchObject({ ageGate: true, autoplayNext: false, autoplayPreview: false }), { timeout: 5000 });
  });
});
