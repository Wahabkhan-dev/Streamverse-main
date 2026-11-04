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
      const body = u.includes("/admin/movies")
        ? { data: [{ slug: "quiet-tide-film", title: "The Quiet Tide (film)" }], pagination: { total: 1 } }
        : u.includes("/admin/ebooks")
          ? { data: [{ slug: "quiet-tide", title: "The Quiet Tide", author: "Mara Quinn" }], pagination: { total: 1 } }
          : u.includes("/admin/users")
            ? { data: [{ id: "u9", name: "Quinn Rivers", email: "quinn@example.com", role: "user", active: true, createdAt: "2026-10-01T00:00:00.000Z", lastLoginAt: null, country: null, subscriptionStatus: null }], pagination: { total: 1 } }
            : { data: null };
      return new Response(JSON.stringify({ success: true, message: "ok", ...body }), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Admin search box (live)", () => {
  it("finds the real titles and customers on the server, not the sample ones", async () => {
    renderAt("/admin/settings");
    const box = await screen.findByLabelText("Search the admin console", {}, { timeout: 8000 });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "quiet" } });
    expect(await screen.findByText("The Quiet Tide (film)", {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText("Movie")).toBeTruthy();
    expect(screen.getByText("eBook · Mara Quinn")).toBeTruthy();
    expect(screen.getByText("User · quinn@example.com")).toBeTruthy();
    const search = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/admin/movies"));
    expect(search.some((u) => u.includes("search=quiet"))).toBe(true);
  });
});
