import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsCache } from "../../src/utils/analyticsCache";
import { __setRedisClientsForTests, decode, encode, isSharedKey } from "../../src/utils/redisCache";

/** Just the Redis commands redisCache.ts uses, shared by every "instance" through one store and one pub/sub bus. */
function fakeRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>();
  const bus = new EventEmitter();
  const live = (k: string) => {
    const e = store.get(k);
    if (e && Date.now() > e.expiresAt) store.delete(k);
    return store.get(k);
  };
  const main = {
    status: "ready",
    get: async (k: string) => live(k)?.value ?? null,
    set: async (k: string, value: string, _px: "PX", ms: number) => (store.set(k, { value, expiresAt: Date.now() + ms }), "OK"),
    scan: async (_cursor: string, _m: "MATCH", pattern: string) => ["0", [...store.keys()].filter((k) => k.startsWith(pattern.replace(/\*$/, "")))],
    unlink: async (...keys: string[]) => keys.filter((k) => store.delete(k)).length,
    publish: async (channel: string, message: string) => (bus.emit(channel, message), 1),
  };
  const subscriber = Object.assign(new EventEmitter(), {
    subscribe: async (channel: string) => bus.on(channel, (message: string) => subscriber.emit("message", channel, message)),
  });
  return { store, main, subscriber, bus };
}

const flush = () => new Promise((r) => setTimeout(r, 5));
let redis: ReturnType<typeof fakeRedis>;

beforeEach(() => {
  redis = fakeRedis();
  __setRedisClientsForTests(redis.main as unknown as Redis, redis.subscriber as unknown as Redis);
  analyticsCache.invalidateLocal();
});
afterEach(() => __setRedisClientsForTests(null));

describe("redisCache encoding", () => {
  it("round-trips the value types cached payloads contain (Date, Map, Set, BigInt) — not just plain JSON", () => {
    const value = { at: new Date("2026-01-02T03:04:05.678Z"), urls: new Map([["a1", "https://x/1"], ["a2", null]]), tags: new Set(["x"]), size: 12n, nested: [{ d: new Date(0) }], plain: { $d: 5 } };
    const back = decode<typeof value>(encode({ value, expiresAt: 1, staleUntil: 2 })).value;
    expect(back.at).toBeInstanceOf(Date);
    expect(back.at.toISOString()).toBe("2026-01-02T03:04:05.678Z");
    expect(back.urls).toBeInstanceOf(Map);
    expect(back.urls.get("a1")).toBe("https://x/1");
    expect(back.tags).toBeInstanceOf(Set);
    expect(back.size).toBe(12n);
    expect(back.nested[0]!.d).toBeInstanceOf(Date);
    expect(back.plain).toEqual({ $d: 5 }); // a look-alike that is not a tagged value stays as it was
  });

  it("only public keys are shared", () => {
    expect(isSharedKey("homepage:banners:all:all")).toBe(true);
    expect(isSharedKey("media:playlist:a:1:master.m3u8")).toBe(true);
    expect(isSharedKey("dashboard:summary")).toBe(false);
  });
});

describe("analyticsCache with Redis as the shared level", () => {
  it("an instance with an empty memory uses the copy another instance put in Redis, without rebuilding it", async () => {
    const build = vi.fn(async () => ({ title: "Banner", startsAt: new Date("2026-05-01T00:00:00Z") }));
    await analyticsCache.getOrSet("homepage:banners:all:all", build, 60);
    await flush();
    expect(redis.store.has("sv:cache:homepage:banners:all:all")).toBe(true);

    analyticsCache.invalidateLocal(); // = a second instance, nothing in its memory
    const rebuild = vi.fn(async () => ({ title: "SHOULD NOT RUN", startsAt: new Date() }));
    const got = await analyticsCache.getOrSet("homepage:banners:all:all", rebuild, 60);
    expect(rebuild).not.toHaveBeenCalled();
    expect(got.title).toBe("Banner");
    expect(got.startsAt).toBeInstanceOf(Date);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("per-instance keys (admin analytics) never go to Redis", async () => {
    await analyticsCache.getOrSet("dashboard:summary", async () => ({ users: 3 }), 60);
    await flush();
    expect([...redis.store.keys()]).toEqual([]);
  });

  it("an admin change (invalidate) deletes the shared copies and tells every other instance to drop its memory copy", async () => {
    await analyticsCache.getOrSet("homepage:genres", async () => ["Drama"], 60);
    await analyticsCache.getOrSet("homepage:collection:x", async () => ({ name: "X" }), 60);
    await flush();
    const heard: string[] = [];
    redis.bus.on("sv:cache:invalidate", (p: string) => heard.push(p));

    analyticsCache.invalidate("homepage:");
    await flush();
    expect([...redis.store.keys()]).toEqual([]);
    expect(heard).toEqual(["homepage:"]);
    const fresh = vi.fn(async () => ["Drama", "Comedy"]);
    expect(await analyticsCache.getOrSet("homepage:genres", fresh, 60)).toEqual(["Drama", "Comedy"]);
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it("an invalidation announced by ANOTHER instance clears this instance's memory", async () => {
    await analyticsCache.getOrSet("homepage:legal:REFUND_POLICY", async () => ({ version: "1" }), 60);
    await flush();
    redis.store.clear(); // the other instance already deleted the shared copy
    await redis.main.publish("sv:cache:invalidate", "homepage:");
    const fresh = vi.fn(async () => ({ version: "2" }));
    expect(await analyticsCache.getOrSet("homepage:legal:REFUND_POLICY", fresh, 60)).toEqual({ version: "2" });
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it("Redis down: everything still works from memory and the database", async () => {
    redis.main.status = "end";
    const build = vi.fn(async () => "value");
    expect(await analyticsCache.getOrSet("homepage:public:0:10", build, 60)).toBe("value");
    expect(await analyticsCache.getOrSet("homepage:public:0:10", build, 60)).toBe("value");
    expect(build).toHaveBeenCalledTimes(1);
    expect(() => analyticsCache.invalidate("homepage:")).not.toThrow();
  });
});
