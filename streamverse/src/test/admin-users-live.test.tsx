import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The live site runs with VITE_DEMO_MODE=false: the admin console reads the real API.
vi.hoisted(() => {
  (import.meta.env as Record<string, string>)["VITE_DEMO_MODE"] = "false";
});

import { setAuthUser } from "@/lib/authState";
import type { ApiUser } from "@/api/types";
import { renderAt, resetAll } from "./utils";

const admin = { id: "a1", email: "admin@example.com", fullName: "Admin", avatarUrl: null, role: "admin", status: "ACTIVE", emailVerified: true, preferences: { country: null, preferredLanguage: null, subtitleLanguage: null, audioLanguage: null, videoQuality: null, audiobookSpeed: null }, createdAt: "2026-11-01T00:00:00.000Z" } as unknown as ApiUser;

const listed = { id: "u9", email: "sam@example.com", name: "Sam Carter", role: "user", subscriptionStatus: "ACTIVE", country: "PK", createdAt: "2026-10-01T00:00:00.000Z", lastLoginAt: "2026-11-03T10:00:00.000Z", active: true };
/** What GET /admin/users/:id/activity returns. */
const activity = {
  subscription: { status: "ACTIVE", plan: { id: "p2", name: "Standard", priceAmount: 999, currency: "usd", billingInterval: "MONTHLY" }, currentPeriodStart: "2026-11-04T00:00:00.000Z", currentPeriodEnd: "2026-12-04T00:00:00.000Z", cancelAtPeriodEnd: false },
  payments: [{ id: "pay1", date: "2026-11-04T00:28:45.000Z", amount: 999, currency: "usd", status: "SUCCEEDED", plan: { id: "p2", name: "Standard" }, invoiceReference: "in_9", refunded: false }],
  library: [{ id: "c1", title: "The Quiet Tide", type: "EBOOK", at: "2026-11-02T08:00:00.000Z" }],
  history: [{ id: "c2", title: "Crimson Horizon", type: "MOVIE", activityType: "WATCHED", at: "2026-11-03T20:00:00.000Z" }],
};

beforeEach(() => {
  resetAll("admin");
  setAuthUser(admin);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const body = u.includes("/activity") ? { data: activity } : u.includes("/admin/users") ? { data: [listed], pagination: { total: 1 } } : { data: null };
      return new Response(JSON.stringify({ success: true, message: "ok", ...body }), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Admin -> Users -> one customer (live)", () => {
  it("shows the customer's real plan, billing, library and history, and none of the old invented sample data", async () => {
    renderAt("/admin/users?u=u9");
    const dialog = await waitFor(
      () => {
        const d = document.querySelector<HTMLElement>('[role="dialog"]');
        if (!d) throw new Error("no dialog");
        return d;
      },
      { timeout: 8000 },
    );
    expect(await within(dialog).findByText("Standard", {}, { timeout: 5000 })).toBeTruthy(); // overview: the real plan name

    const open = (label: string) => fireEvent.click(within(dialog).getByText(label).closest("button") as HTMLButtonElement);
    open("Subscription");
    expect(await within(dialog).findByText("$9.99 / month")).toBeTruthy();
    expect(within(dialog).getAllByText("Active").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("$9.99")).toBeTruthy(); // the real payment
    expect(within(dialog).getByText("Succeeded")).toBeTruthy();
    expect(within(dialog).queryByText(/INV-/)).toBeNull(); // the old code invented "INV-..." rows

    open("Library");
    expect(await within(dialog).findByText("The Quiet Tide")).toBeTruthy();
    open("History");
    expect(await within(dialog).findByText("Crimson Horizon")).toBeTruthy();
    expect(within(dialog).getByText("Watched")).toBeTruthy();
    expect(within(dialog).queryByText(/sample data/i)).toBeNull();
  });
});
