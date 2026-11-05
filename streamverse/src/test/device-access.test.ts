import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";

const register = vi.fn();
vi.mock("@/api/devices.api", () => ({ devicesApi: { register: (...a: unknown[]) => register(...a), list: vi.fn(), remove: vi.fn() } }));

import { accessMessage, deniedMessage } from "@/lib/accessMessage";
import { ensureDeviceRegistered, forgetDeviceRegistration, thisDeviceId } from "@/lib/device";

beforeEach(() => {
  register.mockReset();
  forgetDeviceRegistration();
});

describe("registering this device before playing", () => {
  it("registers once, then not again for the rest of the visit", async () => {
    register.mockResolvedValue({ data: {} });
    await ensureDeviceRegistered();
    await ensureDeviceRegistered();
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0]![0]).toMatchObject({ deviceIdentifier: thisDeviceId() });
  });

  it("over the plan's limit it throws the server's message so the player can show it", async () => {
    const msg = "Your Basic plan allows 1 device, and it is already in use. Remove a device you no longer use (Subscription → Your devices), or upgrade your plan to add more.";
    register.mockRejectedValue(new ApiError(403, "DEVICE_LIMIT_REACHED", msg));
    await expect(ensureDeviceRegistered()).rejects.toMatchObject({ code: "DEVICE_LIMIT_REACHED", message: msg });
    expect(accessMessage(new ApiError(403, "DEVICE_LIMIT_REACHED", msg), "fallback")).toBe(msg);
  });

  it("any other failure (offline, server busy) never stops someone from watching, and is retried next time", async () => {
    register.mockRejectedValueOnce(new Error("network down")).mockResolvedValue({ data: {} });
    await expect(ensureDeviceRegistered()).resolves.toBeUndefined();
    await ensureDeviceRegistered();
    expect(register).toHaveBeenCalledTimes(2);
  });

  it("keeps the same id for this browser", () => {
    expect(thisDeviceId()).toBe(thisDeviceId());
  });
});

describe("what the customer reads when something can't be opened", () => {
  it("shows the server's sentence for limits and plan problems", () => {
    expect(accessMessage(new ApiError(403, "CONCURRENT_STREAM_LIMIT_REACHED", "Your Basic plan allows 1 stream at the same time, and it is already playing."), "x")).toMatch(/allows 1 stream/);
    expect(deniedMessage({ message: "Your current plan doesn't include eBooks. Upgrade to a plan that does to open this title." })).toMatch(/doesn't include eBooks/);
  });
  it("never shows a bare code or a server crash text; uses the fallback instead", () => {
    expect(accessMessage(new ApiError(403, "X", "SOME_CODE"), "We couldn't start this movie.")).toBe("We couldn't start this movie.");
    expect(accessMessage(new ApiError(500, "INTERNAL", "Something went wrong"), "We couldn't start this movie.")).toBe("We couldn't start this movie.");
    expect(accessMessage(new Error("boom"), "We couldn't start this movie.")).toBe("We couldn't start this movie.");
  });
  it("keeps the expired-download message", () => {
    expect(accessMessage(new ApiError(403, "DOWNLOAD_EXPIRED", "x"), "f")).toMatch(/download has expired/);
  });
});
