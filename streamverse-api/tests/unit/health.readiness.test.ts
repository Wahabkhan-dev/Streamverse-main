import { describe, expect, it, vi } from "vitest";

// Redis is configured but nothing uses it (the queue is "inline"): readiness must only depend on the database.
vi.mock("../../src/config/env", () => ({ env: { REDIS_URL: "redis://nowhere.invalid:6379", QUEUE_DRIVER: "inline" } }));
vi.mock("../../src/repositories/health.repository", () => ({ pingDatabase: vi.fn().mockResolvedValue(undefined) }));

import { getReadiness } from "../../src/services/health.service";
import { pingDatabase } from "../../src/repositories/health.repository";

describe("readiness with the inline queue", () => {
  it("is ready when the database answers, even though a Redis address is set that nothing uses", async () => {
    const r = await getReadiness();
    expect(r.ready).toBe(true);
    expect(r.checks).toEqual({ database: "ok", redis: "disabled" });
  });
});

describe("readiness during a database outage", () => {
  it("answers within a few seconds (not after the pool's own long timeouts) and reports the database unavailable", async () => {
    vi.useFakeTimers();
    vi.mocked(pingDatabase).mockImplementationOnce(() => new Promise(() => undefined)); // never answers
    const pending = getReadiness();
    await vi.advanceTimersByTimeAsync(3_100);
    const r = await pending;
    vi.useRealTimers();
    expect(r.ready).toBe(false);
    expect(r.checks["database"]).toBe("unavailable");
  });
});
