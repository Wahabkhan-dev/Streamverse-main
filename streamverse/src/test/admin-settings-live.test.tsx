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
      const body = u.includes("/admin/settings") ? { data: {} } : { data: null };
      return new Response(JSON.stringify({ success: true, message: "ok", ...body }), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const posts = () => (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) => String(c[0]).includes("/auth/change-password") && (c[1] as { method?: string })?.method === "POST");

describe("Admin -> Settings -> Change password (live)", () => {
  it("checks the form first, then sends the current and new password to the server", async () => {
    renderAt("/admin/settings");
    fireEvent.click((await screen.findByText("Change password", {}, { timeout: 8000 })).closest("button") as HTMLButtonElement);
    const dialog = await waitFor(() => {
      const d = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!d) throw new Error("no dialog");
      return d;
    });
    const type = (label: string, value: string) => fireEvent.change(within(dialog).getByLabelText(new RegExp(`^${label}(?! again)`)), { target: { value } });
    const submit = () => fireEvent.click(within(dialog).getAllByText("Change password").map((n) => n.closest("button")).find((b) => b?.getAttribute("type") === "submit") as HTMLButtonElement);

    submit();
    expect(within(dialog).getByText("Enter your current password.")).toBeTruthy();
    type("Current password", "Old-pass-123!");
    type("New password", "short");
    submit();
    expect(within(dialog).getByText(/at least 8 characters/)).toBeTruthy();
    type("New password", "New-pass-456!");
    submit();
    expect(within(dialog).getByText(/don't match/)).toBeTruthy();
    expect(posts()).toHaveLength(0); // nothing sent until the form is valid

    fireEvent.change(within(dialog).getByLabelText(/^New password again/), { target: { value: "New-pass-456!" } });
    submit();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(String((posts()[0]![1] as { body: string }).body))).toEqual({ currentPassword: "Old-pass-123!", newPassword: "New-pass-456!" });
  });
});
