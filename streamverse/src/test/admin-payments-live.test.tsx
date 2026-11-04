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

/** Rows exactly as GET /admin/payments sends them: amounts in cents, status in capitals, the customer and plan nested. */
const row = (over: Record<string, unknown>) => ({ userId: "u", subscriptionId: "s", currency: "usd", description: null, paidAt: "2026-11-04T10:00:00.000Z", createdAt: "2026-11-04T10:00:00.000Z", updatedAt: "2026-11-04T10:00:00.000Z", subscription: null, ...over });
const page1 = [
  row({ id: "pay1", stripeInvoiceId: "in_upgrade", amount: 1000, status: "SUCCEEDED", description: "Premium", user: { id: "u1", email: "sam@example.com", fullName: "Sam Carter" } }),
  row({ id: "pay2", stripeInvoiceId: "in_first", amount: 499, status: "SUCCEEDED", subscription: { plan: { name: "Basic" } }, user: { id: "u1", email: "sam@example.com", fullName: "Sam Carter" } }),
];
const page2 = [row({ id: "pay3", stripeInvoiceId: "in_declined", amount: 1499, status: "FAILED", user: { id: "u2", email: "lee@example.com", fullName: "" }, subscription: { plan: { name: "Premium" } } })];

beforeEach(() => {
  resetAll("admin");
  setAuthUser(admin);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const second = u.includes("page=2");
      const body = u.includes("/admin/payments") ? { data: second ? page2 : page1, pagination: { page: second ? 2 : 1, limit: 2, total: 3, totalPages: 2 } } : { data: null };
      return new Response(JSON.stringify({ success: true, message: "ok", ...body }), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Admin -> Payments (live)", () => {
  it("lists EVERY payment (all pages) with the customer's name, the plan, dollars and a readable status", async () => {
    renderAt("/admin/payments");
    expect(await screen.findByText("in_upgrade", {}, { timeout: 8000 })).toBeTruthy();
    // the second page of results is loaded too
    expect(await screen.findByText("in_declined", {}, { timeout: 5000 })).toBeTruthy();
    const pages = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/admin/payments"));
    expect(pages.some((u) => u.includes("page=1"))).toBe(true);
    expect(pages.some((u) => u.includes("page=2"))).toBe(true);

    // dollars, not cents ($10.00, not $1000.00)
    expect(screen.getAllByText("$10.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$4.99").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$14.99").length).toBeGreaterThan(0);
    expect(screen.queryByText("$1000.00")).toBeNull();
    // the customer's name (or email when there is no name), never the internal id
    expect(screen.getAllByText("Sam Carter").length).toBe(2);
    expect(screen.getByText("lee@example.com")).toBeTruthy();
    expect(screen.queryByText("u1")).toBeNull();
    // the plan each payment was for: recorded one first, else the subscription's plan
    expect(screen.getAllByText("Premium", { selector: "td" })).toHaveLength(2); // the upgrade payment and the declined one
    expect(screen.getByText("Basic", { selector: "td" })).toBeTruthy();
    // statuses are in the table's words, so the totals work
    expect(screen.getAllByText("Succeeded").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(1);
    expect(screen.queryByText("SUCCEEDED")).toBeNull();
    // total revenue = the two succeeded payments only ($10.00 + $4.99)
    expect(screen.getAllByText("$14.99").length).toBeGreaterThan(1);
  });
});
