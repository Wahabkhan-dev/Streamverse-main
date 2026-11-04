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

/** What GET /admin/plans returns, with the new subscriberCount. */
const standard = { id: "p2", name: "Standard", slug: "standard", description: "Everything on two screens", price: 999, priceAmount: 999, currency: "usd", billingInterval: "MONTHLY", trialDays: null, features: ["Full HD"], active: true, displayOrder: 1, maxDevices: 3, maxConcurrentStreams: 2, maxVideoQuality: "1080p", moviesEnabled: true, ebooksEnabled: true, audiobooksEnabled: true, subscriberCount: 12, stripePriceId: "price_1", stripeProductId: "prod_1" };

const calls = () => (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
const puts = () => calls().filter((c) => (c[1] as { method?: string } | undefined)?.method === "PUT" && String(c[0]).includes("/admin/plans/p2"));

beforeEach(() => {
  resetAll("admin");
  setAuthUser(admin);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      const u = String(url);
      const body = u.includes("/admin/subscriptions")
        ? { data: [], pagination: { total: u.includes("status=CANCELED") ? 3 : 12 } }
        : u.includes("/admin/plans") ? (init?.method === "PUT" ? { data: { ...standard } } : { data: [standard] }) : { data: null };
      return new Response(JSON.stringify({ success: true, message: "ok", ...body }), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Admin -> Subscriptions plan editor (live)", () => {
  it("shows the plan's limits, explains what customers get, warns who a change reaches, and saves every field", async () => {
    renderAt("/admin/subscriptions");
    // the card shows the limits as chips, and how many customers are on the plan
    const chips = await screen.findByLabelText("Standard limits", {}, { timeout: 8000 });
    expect(within(chips).getByText("Up to 1080p")).toBeTruthy();
    expect(within(chips).getByText("3 devices")).toBeTruthy();
    expect(within(chips).getByText("2 at once")).toBeTruthy();
    expect(screen.getByText("12 subscribers")).toBeTruthy();
    // the cancellation tile is the real count (3 of 12), not an invented number
    expect(await screen.findByText("25% of all subscriptions")).toBeTruthy();
    expect(screen.queryByText("428")).toBeNull();

    fireEvent.click(screen.getAllByText("Edit plan")[0]!.closest("button") as HTMLButtonElement);
    const dialog = await waitFor(() => {
      const d = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!d) throw new Error("no dialog");
      return d;
    });

    // plain-language summary of what a customer on this plan gets
    const summary = within(dialog).getByLabelText("What customers on this plan get");
    expect(within(summary).getByText("Unlocks movies, eBooks and audiobooks.")).toBeTruthy();
    expect(within(summary).getByText("Video plays in 1080p (Full HD).")).toBeTruthy();
    expect(within(summary).getByText("Up to 3 devices signed in at once.")).toBeTruthy();
    // nothing changed yet, so nothing is said about the 12 customers
    expect(within(dialog).getByText(/Nothing you've changed affects what they get/)).toBeTruthy();

    // lower the device limit to 1 and turn eBooks off
    const devices = within(dialog).getByLabelText("Devices: how many") as HTMLInputElement;
    fireEvent.change(devices, { target: { value: "1" } });
    fireEvent.click(within(dialog).getByText("eBooks").closest("button") as HTMLButtonElement);

    const impact = within(dialog).getByLabelText("Who this change affects");
    expect(within(impact).getByText(/12 customers are on this plan/)).toBeTruthy();
    expect(within(impact).getByText(/lose access to eBooks straight away/)).toBeTruthy();
    expect(within(impact).getByText(/No new device can be added above 1 device/)).toBeTruthy();

    // saving needs the admin's confirmation first, and nothing is sent without it
    fireEvent.click(within(dialog).getByText("Save changes").closest("button") as HTMLButtonElement);
    expect(within(dialog).getByText(/Please confirm you understand this changes things for the 12 customers/)).toBeTruthy();
    expect(puts()).toHaveLength(0);

    fireEvent.click(within(impact).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByText("Save changes").closest("button") as HTMLButtonElement);
    await waitFor(() => expect(puts()).toHaveLength(1));
    const sent = JSON.parse(String((puts()[0]![1] as { body: string }).body));
    expect(sent).toMatchObject({ name: "Standard", priceAmount: 999, billingInterval: "MONTHLY", moviesEnabled: true, ebooksEnabled: false, audiobooksEnabled: true, maxVideoQuality: "1080p", maxDevices: 1, maxConcurrentStreams: 2 });
    expect(sent.slug).toBeUndefined(); // editing never renames the plan's address
  });
});
