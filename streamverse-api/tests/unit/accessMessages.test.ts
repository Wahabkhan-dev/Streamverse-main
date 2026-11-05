import { describe, expect, it } from "vitest";
import { deviceLimitMessage, denialMessage, streamLimitMessage } from "../../src/services/entitlement/accessMessages";

/** Every reason a title can't be opened must read as a sentence a customer can act on, never a code. */
describe("access messages", () => {
  const reasons = ["AUTH_REQUIRED", "ACCOUNT_SUSPENDED", "SUBSCRIPTION_REQUIRED", "SUBSCRIPTION_INACTIVE", "PLAN_NOT_ELIGIBLE", "AGE_NOT_VERIFIED", "AGE_RESTRICTED", "REGION_RESTRICTED", "NOT_YET_AVAILABLE", "AVAILABILITY_EXPIRED", "MEDIA_NOT_READY", "CONTENT_NOT_FOUND", "NOT_PUBLISHED", "CONTENT_UNAVAILABLE"] as const;

  it.each(reasons)("%s is a readable sentence", (reason) => {
    const m = denialMessage(reason, "movie");
    expect(m.length).toBeGreaterThan(20);
    expect(m).not.toMatch(/^[A-Z_]+$/); // not a bare code
    expect(m).toMatch(/[.]$/);
  });

  it("says which kind of title the plan leaves out", () => {
    expect(denialMessage("PLAN_NOT_ELIGIBLE", "movie")).toMatch(/doesn't include movies.*Upgrade/);
    expect(denialMessage("PLAN_NOT_ELIGIBLE", "ebook")).toMatch(/doesn't include eBooks/);
    expect(denialMessage("PLAN_NOT_ELIGIBLE", "audiobook")).toMatch(/doesn't include audiobooks/);
  });

  it("device and stream limits name the plan and the number, and say what to do", () => {
    expect(deviceLimitMessage(2, "Basic")).toBe("Your Basic plan allows 2 devices, and all of them are already in use. Remove a device you no longer use (Subscription → Your devices), or upgrade your plan to add more.");
    expect(deviceLimitMessage(1)).toMatch(/^Your plan allows 1 device, and it is already in use/);
    expect(streamLimitMessage(1, "Basic")).toMatch(/^Your Basic plan allows 1 stream at the same time, and it is already playing\./);
    expect(streamLimitMessage(3, "Premium")).toMatch(/3 streams at the same time, and all of them are already playing/);
  });
});
