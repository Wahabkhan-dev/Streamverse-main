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

describe("Stripe return pages", () => {
  it("/billing/success confirms the payment, tells the opener window and closes the popup", async () => {
    serve(states.active);
    const close = vi.spyOn(window, "close").mockImplementation(() => undefined);
    const heard: unknown[] = [];
    const listener = new BroadcastChannel("sv-billing");
    listener.onmessage = (e) => heard.push(e.data);
    renderAt("/billing/success?session_id=cs_test_1&popup=1");
    expect(await screen.findByText("Payment received", {}, { timeout: 8000 })).toBeTruthy();
    expect(close).toHaveBeenCalled();
    await waitFor(() => expect(heard).toContainEqual({ type: "paid" }));
    listener.close();
    close.mockRestore();
  });

  it("/billing/success without a popup shows a Continue button", async () => {
    serve(states.active);
    renderAt("/billing/success?session_id=cs_test_1");
    expect(await screen.findByRole("link", { name: "Continue" }, { timeout: 8000 })).toBeTruthy();
  });

  it("/billing/cancel offers a new payment link", async () => {
    serve(states.none);
    renderAt("/billing/cancel");
    expect(await screen.findByRole("link", { name: "Get a new payment link" })).toBeTruthy();
  });
});

const standard = { ...plan, id: "p2", name: "Standard", slug: "standard", price: 999, priceAmount: 999 };

/** Text/DOM queries only: role queries are very slow on this page in jsdom once a dialog has been open. */
async function openPlanDialog(label: "Upgrade" | "Downgrade") {
  const btn = await waitFor(
    () => {
      const el = screen.getAllByText(label).map((n) => n.closest("button")).find((b): b is HTMLButtonElement => !!b && !b.disabled);
      if (!el) throw new Error(`no enabled ${label} button`);
      return el;
    },
    { timeout: 5000 },
  );
  fireEvent.click(btn);
  return waitFor(
    () => {
      const d = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!d) throw new Error("no dialog");
      return d;
    },
    { timeout: 5000 },
  );
}

const callsTo = (part: string) => (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) => String(c[0]).includes(part));
/** only the POSTs (the preview is a GET on a longer URL that starts the same way) */
const postsTo = (part: string) => callsTo(part).filter((c) => (c[1] as { method?: string } | undefined)?.method === "POST");

describe("Upgrade dialog (live)", () => {
  it("shows what you pay, lets you pick the card on file or a new one, needs consent, then upgrades through the API", async () => {
    const premium = { ...plan, id: "p3", name: "Premium", slug: "premium", price: 1499, priceAmount: 1499 };
    serve({ ...states.active, plan: standard }, [], [plan, standard, premium], { preview: previews.upgrade, cards: [card] });
    renderAt("/subscription");
    const up = await openPlanDialog("Upgrade");
    expect(within(up).getByText("Your plan now")).toBeTruthy();
    expect(within(up).getByText("+$5.00/mo")).toBeTruthy();

    // nothing is charged until a plan is chosen AND the customer agrees
    const confirmBtn = () => within(up).getByText(/Confirm upgrade|and upgrade/).closest("button") as HTMLButtonElement;
    expect(confirmBtn().disabled).toBe(true);
    fireEvent.click(up.querySelector('input[name="plan"]') as HTMLInputElement);

    // the breakdown: new plan for the rest of the period, credit for what was already paid, and the amount charged today
    expect(await within(up).findByText("Charged to your card today", {}, { timeout: 5000 })).toBeTruthy();
    expect(within(up).getByText("-$6.60")).toBeTruthy();
    expect(within(up).getAllByText("$3.30").length).toBeGreaterThan(0);

    // pay with the card on file (preselected) or choose to enter a different one
    const radios = Array.from(up.querySelectorAll<HTMLInputElement>('input[name="card"]'));
    expect(radios).toHaveLength(2);
    expect(radios[0]!.checked).toBe(true);
    expect(within(up).getByText("Visa •••• 4242")).toBeTruthy();
    expect(within(up).getByText("Use a different card")).toBeTruthy();

    // consent first
    expect(confirmBtn().disabled).toBe(true);
    fireEvent.click(up.querySelector('input[type="checkbox"]') as HTMLInputElement);
    expect(confirmBtn().disabled).toBe(false);
    expect(confirmBtn().textContent).toContain("Pay $3.30 and upgrade");
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(postsTo("/me/subscription/change-plan")).toHaveLength(1));
    const call = postsTo("/me/subscription/change-plan")[0]!;
    expect(JSON.parse(String((call[1] as { body: string }).body))).toEqual({ planId: "p3", consent: true });
  });
});

describe("Subscription page in live mode", () => {

  it("shows the customer's credit where they see their plan", async () => {
    serve(states.active, [], [plan], { credit: 330 });
    renderAt("/subscription");
    expect(await screen.findByText(/\$3\.30 account credit\./, {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText(/taken off your next invoice automatically/)).toBeTruthy();
  });

  it("shows a paid customer's billing history (plan arrives as an object) instead of crashing", async () => {
    serve(states.active, paid);
    renderAt("/subscription");
    expect(await screen.findByText("in_123", {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.getAllByText("Basic").length).toBeGreaterThan(0);
  });

  it("offers a fresh payment link when the payment was never finished", async () => {
    serve(states.incomplete);
    renderAt("/subscription");
    expect(await screen.findByRole("button", { name: /Get a new payment link for Basic/ }, { timeout: 5000 })).toBeTruthy();
  });

  it("offers the plans to a customer who has none", async () => {
    serve(states.none);
    renderAt("/subscription");
    expect(await screen.findByRole("button", { name: "Subscribe" }, { timeout: 5000 })).toBeTruthy();
  });

  it.each(["none", "incomplete", "active"] as const)("renders for a customer in the %s state, never the error screen", async (state) => {
    serve(states[state]);
    renderAt("/subscription");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Subscription" })).toBeTruthy(), { timeout: 5000 });
    expect(screen.queryByText("Something went wrong")).toBeNull();
    // really live mode: the page asked the API for the subscription
    expect((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes("/me/subscription"))).toBe(true);
  });
});
