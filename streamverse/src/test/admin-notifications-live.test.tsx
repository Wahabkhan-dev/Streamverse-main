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

const pastDue = { id: "s1", status: "PAST_DUE", updatedAt: new Date(Date.now() - 3 * 3600_000).toISOString(), user: { fullName: "Sam Carter", email: "sam@example.com" }, plan: { name: "Standard" } };
const failedPayment = { id: "p1", amount: 999, currency: "usd", createdAt: new Date(Date.now() - 26 * 3600_000).toISOString(), user: { fullName: "Lee Wong" }, subscription: { plan: { name: "Basic" } } };

beforeEach(() => {
  resetAll("admin");
  setAuthUser(admin);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      const u = String(url);
      const body = u.includes("/admin/notifications/announce")
        ? { data: { sent: 5 } }
        : u.includes("/admin/subscriptions")
          ? { data: [pastDue], pagination: { total: 1 } }
          : u.includes("/admin/payments")
            ? { data: [failedPayment], pagination: { total: 1 } }
            : { data: null };
      return new Response(JSON.stringify({ success: true, message: "ok", ...body }), { status: init?.method === "POST" ? 201 : 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const announces = () => (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) => String(c[0]).includes("/admin/notifications/announce") && (c[1] as { method?: string })?.method === "POST");

describe("Admin -> Notifications (live)", () => {
  it("lists real failed renewals and payments (none of the old made-up alerts) and really sends an announcement", async () => {
    renderAt("/admin/notifications");
    expect(await screen.findByText("Renewal failed for Sam Carter", {}, { timeout: 8000 })).toBeTruthy();
    expect(screen.getByText("Payment of $9.99 failed for Lee Wong")).toBeTruthy();
    expect(screen.queryByText(/Oliver Grant/)).toBeNull();
    expect(screen.queryByText(/124 payments pending review/)).toBeNull();

    // an announcement is not "sent" until the server says so
    fireEvent.click(screen.getByText("Send").closest("button") as HTMLButtonElement);
    expect(screen.getByText("Add a title for the announcement.")).toBeTruthy();
    expect(announces()).toHaveLength(0);

    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Maintenance on Sunday" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Back by 3am" } });
    fireEvent.click(screen.getByText("Send").closest("button") as HTMLButtonElement);
    await waitFor(() => expect(announces()).toHaveLength(1));
    expect(JSON.parse(String((announces()[0]![1] as { body: string }).body))).toEqual({ kind: "NEW_RELEASE", title: "Maintenance on Sunday", message: "Back by 3am" });
  });
});
