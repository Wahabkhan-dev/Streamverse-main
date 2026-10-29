import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsCache } from "../../src/utils/analyticsCache";

beforeEach(() => {
  vi.useFakeTimers();
  analyticsCache.invalidate();
});
afterEach(() => vi.useRealTimers());

describe("analyticsCache", () => {
  it("serves a fresh entry without recomputing", async () => {
    const fn = vi.fn(async () => "v1");
    expect(await analyticsCache.getOrSet("k", fn, 10, 30)).toBe("v1");
    expect(await analyticsCache.getOrSet("k", fn, 10, 30)).toBe("v1");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("shares one computation between concurrent misses", async () => {
    let calls = 0;
    const fn = async () => { calls++; await new Promise((r) => setTimeout(r, 100)); return "v"; };
    const all = Promise.all([analyticsCache.getOrSet("k", fn, 10), analyticsCache.getOrSet("k", fn, 10), analyticsCache.getOrSet("k", fn, 10)]);
    await vi.advanceTimersByTimeAsync(150);
    expect(await all).toEqual(["v", "v", "v"]);
    expect(calls).toBe(1);
  });

  it("serves a stale entry instantly while refreshing it in the background", async () => {
    let n = 0;
    const fn = async () => `v${++n}`;
    await analyticsCache.getOrSet("k", fn, 10, 30);
    vi.advanceTimersByTime(15_000); // past fresh, inside the stale window
    expect(await analyticsCache.getOrSet("k", fn, 10, 30)).toBe("v1"); // stale copy, no waiting
    await vi.advanceTimersByTimeAsync(0);
    expect(await analyticsCache.getOrSet("k", fn, 10, 30)).toBe("v2"); // the refresh landed
  });

  it("computes again once even the stale window has passed", async () => {
    let n = 0;
    const fn = async () => `v${++n}`;
    await analyticsCache.getOrSet("k", fn, 10, 5);
    vi.advanceTimersByTime(20_000);
    expect(await analyticsCache.getOrSet("k", fn, 10, 5)).toBe("v2");
  });

  it("keeps serving the stale copy if the background refresh fails", async () => {
    let fail = false;
    const fn = async () => { if (fail) throw new Error("db down"); return "good"; };
    await analyticsCache.getOrSet("k", fn, 10, 30);
    fail = true;
    vi.advanceTimersByTime(15_000);
    expect(await analyticsCache.getOrSet("k", fn, 10, 30)).toBe("good");
  });

  it("invalidate() drops entries and a computation that started before it does not store its outdated result", async () => {
    let value = "old";
    const slow = async () => { const v = value; await new Promise((r) => setTimeout(r, 100)); return v; };
    const pending = analyticsCache.getOrSet("homepage:x", slow, 10);
    analyticsCache.invalidate("homepage:"); // an admin write happens mid-computation
    value = "new";
    await vi.advanceTimersByTimeAsync(150);
    await pending;
    expect(await analyticsCache.getOrSet("homepage:x", async () => value, 10)).toBe("new");
  });

  it("refreshAging() rebuilds a used entry once it is mostly through its fresh time", async () => {
    let n = 0;
    const fn = async () => `v${++n}`;
    await analyticsCache.getOrSet("homepage:hot", fn, 10, 30);
    vi.advanceTimersByTime(3_000);
    expect(analyticsCache.refreshAging("homepage:", 600_000)).toBe(0); // still young
    vi.advanceTimersByTime(4_000); // 7s of 10s
    expect(analyticsCache.refreshAging("homepage:", 600_000)).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(analyticsCache.get("homepage:hot")).toBe("v2");
  });

  it("refreshAging() leaves entries nobody has asked for lately alone", async () => {
    await analyticsCache.getOrSet("homepage:idle", async () => "i", 10, 30);
    vi.advanceTimersByTime(7_000);
    expect(analyticsCache.refreshAging("homepage:", 5_000)).toBe(0); // last asked for 7s ago, limit is 5s
  });
});
