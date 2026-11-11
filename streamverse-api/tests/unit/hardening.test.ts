import { describe, expect, it, vi } from "vitest";
import { createInlineQueueProvider } from "../../src/services/queue/inline.queue.provider";
import * as entitlementCache from "../../src/services/entitlement/entitlementCache.service";
import { isMissingObject, storageReadError } from "../../src/services/storage/storageErrors";
import { redactUrls } from "../../src/services/media/ffmpeg.mediaProcessor";
import type { AccessDecision } from "../../src/services/entitlement/entitlement.service";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("inline queue (the API process is the worker)", () => {
  it("runs one job of a queue at a time by default; the rest wait their turn and all of them run", async () => {
    const queue = createInlineQueueProvider(1);
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    const release: (() => void)[] = [];
    queue.registerProcessor<{ n: number }>("video", async ({ n }) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise<void>((r) => release.push(r));
      running--;
      done.push(n);
    });
    for (let n = 0; n < 4; n++) await queue.enqueue("video", { n });
    await tick();
    expect(running).toBe(1);
    while (done.length < 4) {
      release.shift()?.();
      await tick();
    }
    expect(peak).toBe(1);
    expect(done).toEqual([0, 1, 2, 3]);
  });

  it("a failing job does not stop the queue", async () => {
    const queue = createInlineQueueProvider(1);
    const done: number[] = [];
    queue.registerProcessor<{ n: number }>("q", async ({ n }) => {
      if (n === 0) throw new Error("bad file");
      done.push(n);
    });
    await queue.enqueue("q", { n: 0 });
    await queue.enqueue("q", { n: 1 });
    await tick();
    await tick();
    expect(done).toEqual([1]);
  });

  it("honours a higher concurrency when configured", async () => {
    const queue = createInlineQueueProvider(2);
    let running = 0;
    let peak = 0;
    queue.registerProcessor("q", async () => {
      running++;
      peak = Math.max(peak, running);
      await tick();
      running--;
    });
    for (let n = 0; n < 5; n++) await queue.enqueue("q", {});
    await new Promise((r) => setTimeout(r, 60));
    expect(peak).toBe(2);
  });
});

describe("entitlement cache memory bound", () => {
  it("never grows past its cap, however many distinct (customer, title) pairs are seen", () => {
    entitlementCache.clear();
    const decision = { canViewMetadata: true } as unknown as AccessDecision;
    for (let i = 0; i < 25_000; i++) entitlementCache.set(entitlementCache.cacheKey(`u${i}`, "c", "movie"), decision, 60_000);
    expect(entitlementCache.size()).toBeLessThanOrEqual(20_000);
    // the newest entries are the ones kept
    expect(entitlementCache.get(entitlementCache.cacheKey("u24999", "c", "movie"))).toBeDefined();
    entitlementCache.clear();
  });

  it("sweeps expired entries first when it is full", () => {
    entitlementCache.clear();
    vi.useFakeTimers();
    const decision = { canViewMetadata: true } as unknown as AccessDecision;
    for (let i = 0; i < 20_000; i++) entitlementCache.set(`old${i}:c:movie`, decision, 1_000);
    vi.advanceTimersByTime(2_000);
    entitlementCache.set("fresh:c:movie", decision, 60_000);
    expect(entitlementCache.size()).toBe(1);
    vi.useRealTimers();
    entitlementCache.clear();
  });
});

describe("storage read failures", () => {
  it("'no such object' is a 404; storage being down or slow is a 503, never a misleading 404", () => {
    expect(isMissingObject({ name: "NoSuchKey" })).toBe(true);
    expect(isMissingObject({ $metadata: { httpStatusCode: 404 } })).toBe(true);
    expect(isMissingObject({ code: "ENOENT" })).toBe(true);
    expect(storageReadError({ name: "NoSuchKey" }, "Playlist not found").statusCode).toBe(404);
    for (const outage of [{ name: "TimeoutError" }, { code: "ECONNREFUSED" }, { $metadata: { httpStatusCode: 503 } }, new Error("socket hang up")]) {
      const e = storageReadError(outage, "Playlist not found");
      expect(e.statusCode).toBe(503);
      expect(e.message).not.toMatch(/socket|ECONN|Timeout/);
    }
  });
});

describe("media processing errors never carry the signed source link", () => {
  it("replaces every URL in an ffmpeg log tail", () => {
    const log = "https://bucket.r2.cloudflarestorage.com/media/x.mp4?X-Amz-Signature=abc: Invalid data found | Input #0, from 'https://h/y.mp4?t=1'";
    const clean = redactUrls(log);
    expect(clean).not.toMatch(/https?:|Signature|t=1/);
    expect(clean).toContain("Invalid data found");
  });
});
