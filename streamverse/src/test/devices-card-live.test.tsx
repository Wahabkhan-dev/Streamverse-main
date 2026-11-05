import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (import.meta.env as Record<string, string>)["VITE_DEMO_MODE"] = "false";
});

import { DevicesCard } from "@/components/sv/billing/DevicesCard";
import { thisDeviceId } from "@/lib/device";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The customer is told how many devices the plan allows and how many are used, and can free a place. */
describe("Your devices (live)", () => {
  it("shows the limit, marks this device, and removing another one calls the server", async () => {
    const devices = [
      { id: "d1", deviceIdentifier: thisDeviceId(), deviceName: "Chrome on Windows", deviceType: "WEB", platform: "web", status: "ACTIVE", lastSeenAt: "2026-11-05T10:00:00.000Z", createdAt: "2026-11-01T10:00:00.000Z" },
      { id: "d2", deviceIdentifier: "other-phone", deviceName: "Safari on iOS", deviceType: "WEB", platform: "web", status: "ACTIVE", lastSeenAt: "2026-11-03T10:00:00.000Z", createdAt: "2026-11-02T10:00:00.000Z" },
    ];
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${String(url)}`);
        const body = init?.method === "DELETE" ? { data: { message: "Device removed" } } : { data: devices };
        return new Response(JSON.stringify({ success: true, message: "ok", ...body }), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <DevicesCard maxDevices={2} planName="Basic" />
      </QueryClientProvider>,
    );

    // the limit is explained in words, and all places being used is called out with what to do
    await screen.findByText(/Your Basic plan allows 2 devices\. 2 in use\. To use another device, remove one you no longer use, or upgrade your plan\./);
    expect(screen.getByText("Chrome on Windows")).toBeTruthy();
    expect(screen.getByText("This device")).toBeTruthy();
    expect(screen.getByText("Safari on iOS")).toBeTruthy();

    // freeing a place: confirm, then the server is asked to remove that device
    fireEvent.click(screen.getAllByText("Remove")[1]!);
    fireEvent.click(await screen.findByText("Remove device"));
    await waitFor(() => expect(calls.some((c) => c.startsWith("DELETE") && c.endsWith("/me/devices/d2"))).toBe(true));
  });
});
