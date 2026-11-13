import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The live site runs with VITE_DEMO_MODE=false: the signup pages ask the real session, not the browser store.
vi.hoisted(() => {
  (import.meta.env as Record<string, string>)["VITE_DEMO_MODE"] = "false";
});

import { clearAuthUser, setAuthUser } from "@/lib/authState";
import { updateUser } from "@/lib/user";
import type { ApiUser } from "@/api/types";
import { renderAt, resetAll } from "./utils";

const customer = { id: "u1", email: "sam@example.com", fullName: "Sam Real", avatarUrl: null, role: "user", status: "ACTIVE", emailVerified: true, preferences: { country: null, preferredLanguage: null, subtitleLanguage: null, audioLanguage: null, videoQuality: null, audiobookSpeed: null }, createdAt: "2026-11-01T00:00:00.000Z" } as unknown as ApiUser;

let subscriptionStatus: string | null = null;

beforeEach(() => {
  resetAll("user");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const data = u.includes("/me/subscription") ? { status: subscriptionStatus, plan: null, currentPeriodStart: null, currentPeriodEnd: null } : u.includes("/plans") ? [] : null;
      return new Response(JSON.stringify({ success: true, message: "ok", data }), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  subscriptionStatus = null;
});

describe("signup pages (live)", () => {
  it("a signed-out visitor stays on Sign up even when the browser still holds the last customer's profile and membership", async () => {
    // what another open tab (or a late request) can leave behind right after "Sign out"
    updateUser((s) => ({ ...s, profile: { ...s.profile, name: "Sam Real", email: "sam@example.com" }, subscription: { ...s.subscription, status: "active" } }));
    clearAuthUser();
    const { router } = renderAt("/signup/plan");
    await new Promise((r) => setTimeout(r, 400));
    expect(router.state.location.pathname).toBe("/signup/plan");
  });

  it("a signed-in customer whose server membership is active is sent home", async () => {
    subscriptionStatus = "ACTIVE";
    setAuthUser(customer);
    const { router } = renderAt("/signup/plan");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"), { timeout: 8000 });
  });

  it("a signed-in customer without a membership can pick a plan (the stale browser 'active' does not count)", async () => {
    subscriptionStatus = null;
    updateUser((s) => ({ ...s, subscription: { ...s.subscription, status: "active" } }));
    setAuthUser(customer);
    const { router } = renderAt("/signup/plan");
    await new Promise((r) => setTimeout(r, 400));
    expect(router.state.location.pathname).toBe("/signup/plan");
  });
});
