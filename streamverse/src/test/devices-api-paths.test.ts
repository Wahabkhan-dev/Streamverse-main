import { afterEach, describe, expect, it, vi } from "vitest";
import { devicesApi } from "@/api/devices.api";

afterEach(() => vi.unstubAllGlobals());

/** The real URLs the server serves (a wrong path is a silent 404 and the device limit then never applies). */
describe("devices API paths", () => {
  it("registers at /me/devices/register, lists at /me/devices, removes at /me/devices/:id", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${new URL(String(url), "http://x").pathname}`);
        return new Response(JSON.stringify({ success: true, message: "ok", data: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    await devicesApi.register({ deviceIdentifier: "d1" });
    await devicesApi.list();
    await devicesApi.remove("abc");
    expect(calls).toEqual(["POST /api/v1/me/devices/register", "GET /api/v1/me/devices", "DELETE /api/v1/me/devices/abc"]);
  });
});
