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

beforeEach(() => {
  resetAll("admin");
  setAuthUser(admin);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const body = u.includes("/admin/subscriptions")
        ? { data: [], pagination: { total: u.includes("status=PAST_DUE") ? 2 : 7 } }
        : u.includes("/admin/users")
          ? { data: [{ id: "u9", email: "sam@example.com", name: "Sam Carter", role: "user", subscriptionStatus: "ACTIVE", country: "PK", createdAt: "2026-10-01T00:00:00.000Z", lastLoginAt: null, active: true }], pagination: { total: 42 } }
          : { data: null };
      return new Response(JSON.stringify({ success: true, message: "ok", ...body }), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Admin -> Users tiles (live)", () => {
  it("show the real number of accounts, paying subscribers and payment problems, not invented figures", async () => {
    renderAt("/admin/users");
    expect(await screen.findByText("42", {}, { timeout: 8000 })).toBeTruthy(); // registered users
    expect(screen.getByText("17% of accounts")).toBeTruthy(); // 7 of 42
    expect(screen.getByText("Renewals that failed")).toBeTruthy();
    expect(screen.queryByText(/sample accounts/)).toBeNull();
    expect(screen.queryByText("Premium members")).toBeNull();
  });
});
